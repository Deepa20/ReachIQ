import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { enrichContact, type ApolloEnrichmentResult } from "@/lib/integrations/apollo";
import { captureException, recordMetric } from "@/lib/observability/monitoring";
import { enqueueRetryJob } from "@/lib/queue/retry-queue";

const enrichBatchSchema = z.object({
  organizationId: z.string().uuid(),
  contacts: z
    .array(
      z
        .object({
          contactId: z.string().uuid().optional(),
          email: z.string().email().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          companyName: z.string().optional(),
          companyDomain: z.string().optional(),
          linkedinUrl: z.string().url().optional(),
        })
        .refine((item) => item.contactId || item.email, "contactId or email is required"),
    )
    .min(1)
    .max(100),
});

type ResolvedContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
};

type EnrichmentBatchItem = {
  contactId: string | null;
  email: string | null;
  status: "enriched" | "failed";
  enrichment?: {
    name: string | null;
    jobTitle: string | null;
    company: string | null;
    linkedinUrl: string | null;
    companySize: number | null;
    industry: string | null;
  };
  error?: string;
};

async function resolveContact(
  supabase: Awaited<ReturnType<typeof requireOrganizationMembership>>["supabase"],
  organizationId: string,
  entry: z.infer<typeof enrichBatchSchema>["contacts"][number],
): Promise<ResolvedContact> {
  if (entry.contactId) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,email,first_name,last_name,title,linkedin_url,company_id,companies(name,domain)")
      .eq("organization_id", organizationId)
      .eq("id", entry.contactId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      throw new Error("Contact not found for provided contactId");
    }

    const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      title: data.title,
      linkedinUrl: data.linkedin_url,
      companyId: data.company_id,
      companyName: company?.name ?? null,
      companyDomain: company?.domain ?? null,
    };
  }

  const email = entry.email!.toLowerCase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,email,first_name,last_name,title,linkedin_url,company_id,companies(name,domain)")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      title: data.title,
      linkedinUrl: data.linkedin_url,
      companyId: data.company_id,
      companyName: company?.name ?? null,
      companyDomain: company?.domain ?? null,
    };
  }

  const inserted = await supabase
    .from("contacts")
    .insert({
      organization_id: organizationId,
      email,
      first_name: entry.firstName ?? null,
      last_name: entry.lastName ?? null,
      linkedin_url: entry.linkedinUrl ?? null,
      status: "new",
      metadata: {},
      deleted_at: null,
    })
    .select("id,email,first_name,last_name,title,linkedin_url,company_id")
    .single();

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }

  return {
    id: inserted.data.id,
    email: inserted.data.email,
    firstName: inserted.data.first_name,
    lastName: inserted.data.last_name,
    title: inserted.data.title,
    linkedinUrl: inserted.data.linkedin_url,
    companyId: inserted.data.company_id,
    companyName: entry.companyName ?? null,
    companyDomain: entry.companyDomain ?? null,
  };
}

async function upsertCompanyForEnrichment(
  supabase: Awaited<ReturnType<typeof requireOrganizationMembership>>["supabase"],
  organizationId: string,
  enrichment: ApolloEnrichmentResult,
): Promise<string | null> {
  if (!enrichment.company) {
    return null;
  }

  const payload = {
    organization_id: organizationId,
    name: enrichment.company,
    domain: enrichment.companyDomain,
    industry: enrichment.industry,
    employee_count: enrichment.companySize,
    metadata: {
      provider: enrichment.provider,
    },
    deleted_at: null,
  };

  if (enrichment.companyDomain) {
    const { data, error } = await supabase
      .from("companies")
      .upsert(payload, { onConflict: "organization_id,domain" })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data.id;
  }

  const { data: existingByName, error: existingByNameError } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", enrichment.company)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existingByNameError) {
    throw new Error(existingByNameError.message);
  }

  if (existingByName?.id) {
    return existingByName.id;
  }

  const { data, error } = await supabase.from("companies").insert(payload).select("id").single();
  if (error) {
    throw new Error(error.message);
  }
  return data.id;
}

function summarize(items: EnrichmentBatchItem[]) {
  return {
    total: items.length,
    enriched: items.filter((item) => item.status === "enriched").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

export async function POST(request: Request) {
  try {
    const body = enrichBatchSchema.parse(await request.json());
    const { supabase } = await requireOrganizationMembership(body.organizationId);
    const results: EnrichmentBatchItem[] = [];

    for (const entry of body.contacts) {
      try {
        const contact = await resolveContact(supabase, body.organizationId, entry);
        const enrichment = await enrichContact({
          email: contact.email,
          firstName: contact.firstName ?? entry.firstName,
          lastName: contact.lastName ?? entry.lastName,
          companyName: entry.companyName ?? contact.companyName ?? undefined,
          companyDomain: entry.companyDomain ?? contact.companyDomain ?? undefined,
          linkedinUrl: entry.linkedinUrl ?? contact.linkedinUrl ?? undefined,
        });

        const companyId = await upsertCompanyForEnrichment(supabase, body.organizationId, enrichment);

        const { error: updateContactError } = await supabase
          .from("contacts")
          .update({
            first_name: enrichment.firstName ?? contact.firstName,
            last_name: enrichment.lastName ?? contact.lastName,
            title: enrichment.jobTitle ?? contact.title,
            linkedin_url: enrichment.linkedinUrl ?? contact.linkedinUrl,
            company_id: companyId,
            status: "enriched",
            metadata: {
              enrichmentProvider: enrichment.provider,
              enrichedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", contact.id);

        if (updateContactError) {
          throw new Error(updateContactError.message);
        }

        const { error: enrichmentInsertError } = await supabase.from("enrichment_results").upsert(
          {
            organization_id: body.organizationId,
            contact_id: contact.id,
            provider: "apollo",
            payload: {
              name: enrichment.name,
              jobTitle: enrichment.jobTitle,
              company: enrichment.company,
              linkedinUrl: enrichment.linkedinUrl,
              companySize: enrichment.companySize,
              industry: enrichment.industry,
              raw: enrichment.raw,
            },
            enriched_at: new Date().toISOString(),
            deleted_at: null,
          },
          {
            onConflict: "organization_id,contact_id,provider",
          },
        );

        if (enrichmentInsertError) {
          throw new Error(enrichmentInsertError.message);
        }

        results.push({
          contactId: contact.id,
          email: contact.email,
          status: "enriched",
          enrichment: {
            name: enrichment.name,
            jobTitle: enrichment.jobTitle,
            company: enrichment.company,
            linkedinUrl: enrichment.linkedinUrl,
            companySize: enrichment.companySize,
            industry: enrichment.industry,
          },
        });
      } catch (error) {
        captureException("Enrichment entry failed", error, {
          route: "/api/enrich",
          organizationId: body.organizationId,
          contactId: entry.contactId ?? null,
          email: entry.email ?? null,
        });
        try {
          await enqueueRetryJob({
            organizationId: body.organizationId,
            jobType: "apollo_enrich_contact",
            payload: {
              email: entry.email,
              firstName: entry.firstName,
              lastName: entry.lastName,
              companyName: entry.companyName,
              companyDomain: entry.companyDomain,
              linkedinUrl: entry.linkedinUrl,
            },
          });
          recordMetric("retry_job_enqueued", 1, {
            route: "/api/enrich",
            jobType: "apollo_enrich_contact",
          });
        } catch (enqueueError) {
          captureException("Failed to enqueue enrichment retry job", enqueueError, {
            route: "/api/enrich",
            organizationId: body.organizationId,
          });
        }
        results.push({
          contactId: entry.contactId ?? null,
          email: entry.email ?? null,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown enrichment error",
        });
      }
    }

    recordMetric("enrichment_batch_processed", 1, {
      route: "/api/enrich",
      total: results.length,
      failed: results.filter((item) => item.status === "failed").length,
    });
    return NextResponse.json({
      summary: summarize(results),
      results,
    });
  } catch (error) {
    return apiErrorResponse(error, { route: "/api/enrich" });
  }
}
