import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { checkCatchAll, validateEmail, verifyDomain, type HunterDomainVerification, type HunterValidationResult } from "@/lib/integrations/hunter";
import { captureException, recordMetric } from "@/lib/observability/monitoring";
import { enqueueRetryJob } from "@/lib/queue/retry-queue";
import { classifyReachIqScore, type LeadClassification } from "@/services/scoring";

const validateBatchSchema = z.object({
  organizationId: z.string().uuid(),
  uploadId: z.string().uuid().optional(),
  contacts: z
    .array(
      z.object({
        email: z.string().email(),
        contactId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

type ContactValidationResult = {
  email: string;
  contactId: string | null;
  status: "valid" | "risky" | "invalid";
  score: number;
  classification: LeadClassification;
  reasons: string[];
};

function toFinalStatus(validation: HunterValidationResult, domain: HunterDomainVerification, catchAll: boolean): ContactValidationResult["status"] {
  if (!domain.exists) return "invalid";
  if (validation.status === "invalid") return "invalid";
  if (catchAll || validation.status === "risky" || domain.disposable || domain.webmail) return "risky";
  return "valid";
}

function toFinalScore(status: ContactValidationResult["status"], baseScore: number): number {
  if (status === "valid") return Math.max(70, baseScore);
  if (status === "risky") return Math.min(69, Math.max(35, baseScore));
  return Math.min(34, baseScore);
}

function summarize(results: ContactValidationResult[]) {
  return {
    total: results.length,
    valid: results.filter((item) => item.status === "valid").length,
    risky: results.filter((item) => item.status === "risky").length,
    invalid: results.filter((item) => item.status === "invalid").length,
    hot: results.filter((item) => item.classification === "HOT").length,
    warm: results.filter((item) => item.classification === "WARM").length,
    cold: results.filter((item) => item.classification === "COLD").length,
  };
}

async function resolveUploadId(
  organizationId: string,
  userId: string,
  providedUploadId: string | undefined,
  count: number,
  supabase: Awaited<ReturnType<typeof requireOrganizationMembership>>["supabase"],
): Promise<string> {
  if (providedUploadId) {
    return providedUploadId;
  }

  const fileName = `hunter-batch-${Date.now()}.json`;
  const { data, error } = await supabase
    .from("uploads")
    .insert({
      organization_id: organizationId,
      uploaded_by: userId,
      file_name: fileName,
      file_path: `virtual://api/validate/${fileName}`,
      mime_type: "application/json",
      row_count: count,
      status: "processing",
      deleted_at: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new ApiError(500, error.message);
  }

  return data.id;
}

export async function POST(request: Request) {
  try {
    const body = validateBatchSchema.parse(await request.json());
    const { supabase, user } = await requireOrganizationMembership(body.organizationId);
    const uploadId = await resolveUploadId(body.organizationId, user.id, body.uploadId, body.contacts.length, supabase);

    const existingContactsByEmail = new Map<string, string>();
    const emailSet = body.contacts.map((item) => item.email.toLowerCase());

    const { data: existingContacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id,email")
      .eq("organization_id", body.organizationId)
      .in("email", emailSet)
      .is("deleted_at", null);

    if (contactsError) {
      throw new ApiError(500, contactsError.message);
    }

    for (const contact of existingContacts ?? []) {
      existingContactsByEmail.set(contact.email.toLowerCase(), contact.id);
    }

    const validationCache = new Map<string, HunterValidationResult>();
    const domainCache = new Map<string, HunterDomainVerification>();
    const results: ContactValidationResult[] = [];

    for (const entry of body.contacts) {
      const email = entry.email.toLowerCase();
      const domain = email.split("@")[1] || "";
      const contactId = entry.contactId ?? existingContactsByEmail.get(email) ?? null;

      try {
        const validation = validationCache.has(email) ? validationCache.get(email)! : await validateEmail(email);
        validationCache.set(email, validation);

        const domainVerification = domainCache.has(domain) ? domainCache.get(domain)! : await verifyDomain(domain);
        domainCache.set(domain, domainVerification);

        const catchAll = await checkCatchAll(email, validation.raw);
        const finalStatus = toFinalStatus(validation, domainVerification, catchAll);
        const reasons = [...validation.reasons];
        if (!domainVerification.exists) reasons.push("Domain could not be verified");
        if (domainVerification.disposable) reasons.push("Domain flagged disposable");
        if (domainVerification.webmail) reasons.push("Domain flagged webmail");
        if (catchAll) reasons.push("Hunter catch-all detected");

        const score = toFinalScore(finalStatus, validation.score);
        const classification = classifyReachIqScore(score);

        const { error: insertError } = await supabase.from("validation_results").insert({
          organization_id: body.organizationId,
          upload_id: uploadId,
          contact_id: contactId,
          validation_status: finalStatus,
          score,
          classification,
          reasons,
          validated_at: new Date().toISOString(),
          deleted_at: null,
        });

        if (insertError) {
          throw new ApiError(500, insertError.message);
        }

        results.push({
          email,
          contactId,
          status: finalStatus,
          score,
          classification,
          reasons,
        });
      } catch (validationError) {
        captureException("Validation provider call failed", validationError, {
          route: "/api/validate",
          organizationId: body.organizationId,
          email,
        });
        try {
          await enqueueRetryJob({
            organizationId: body.organizationId,
            jobType: "hunter_validate_contact",
            payload: {
              email,
            },
          });
          recordMetric("retry_job_enqueued", 1, {
            route: "/api/validate",
            jobType: "hunter_validate_contact",
          });
        } catch (enqueueError) {
          captureException("Failed to enqueue hunter validation retry", enqueueError, {
            route: "/api/validate",
            organizationId: body.organizationId,
            email,
          });
        }
        results.push({
          email,
          contactId,
          status: "invalid",
          score: 0,
          classification: "COLD",
          reasons: [
            "Validation provider unavailable",
            validationError instanceof Error ? validationError.message : "Unknown validation error",
          ],
        });
      }
    }

    await supabase
      .from("uploads")
      .update({
        status: "completed",
        row_count: results.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    return NextResponse.json({
      uploadId,
      summary: summarize(results),
      results,
    });
  } catch (error) {
    return apiErrorResponse(error, { route: "/api/validate" });
  }
}
