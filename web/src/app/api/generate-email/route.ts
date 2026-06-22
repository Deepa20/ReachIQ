import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireApiAuth, requireOrganizationMembership } from "@/lib/api/auth-context";
import { generateClaudeHaikuEmail, type OutreachTone } from "@/lib/integrations/claude-haiku";
import { captureException, recordMetric } from "@/lib/observability/monitoring";
import { logger } from "@/lib/observability/logger";
import { enqueueRetryJob } from "@/lib/queue/retry-queue";

const toneSchema = z.enum(["Warm", "Direct", "Consultative", "Peer to Peer"]);

const generateEmailSchema = z.object({
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  name: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  industry: z.string().min(1),
  signal: z.string().min(1),
  product_description: z.string().min(1),
  tone: toneSchema,
});

type MembershipContext = {
  organizationId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof requireApiAuth>>["supabase"];
};

async function resolveMembershipContext(organizationId: string | undefined): Promise<MembershipContext> {
  if (organizationId) {
    const { supabase, membership } = await requireOrganizationMembership(organizationId);
    return {
      organizationId,
      role: membership.role,
      supabase,
    };
  }

  const { supabase, user } = await requireApiAuth();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id)
    .limit(2);

  if (error) {
    throw new ApiError(500, error.message);
  }

  if (!data?.length) {
    throw new ApiError(403, "You are not a member of any organization");
  }

  if (data.length > 1) {
    throw new ApiError(400, "organizationId is required when you belong to multiple organizations");
  }

  return {
    organizationId: data[0].organization_id,
    role: data[0].role,
    supabase,
  };
}

function assertCanGenerate(role: string) {
  if (!["owner", "admin", "member"].includes(role)) {
    throw new ApiError(403, "You do not have permission to generate emails");
  }
}

function normalizeTone(tone: OutreachTone): string {
  return tone;
}

export async function POST(request: Request) {
  try {
    const body = generateEmailSchema.parse(await request.json());
    const context = await resolveMembershipContext(body.organizationId);
    assertCanGenerate(context.role);

    let generated: Awaited<ReturnType<typeof generateClaudeHaikuEmail>>;
    try {
      generated = await generateClaudeHaikuEmail({
        name: body.name,
        title: body.title,
        company: body.company,
        industry: body.industry,
        signal: body.signal,
        productDescription: body.product_description,
        tone: body.tone,
      });
    } catch (providerError) {
      captureException("Claude generation failed", providerError, {
        route: "/api/generate-email",
        organizationId: context.organizationId,
      });

      const retryJob = await enqueueRetryJob({
        organizationId: context.organizationId,
        jobType: "claude_generate_email",
        payload: {
          organizationId: context.organizationId,
          campaignId: body.campaignId,
          contactId: body.contactId,
          name: body.name,
          title: body.title,
          company: body.company,
          industry: body.industry,
          signal: body.signal,
          product_description: body.product_description,
          tone: body.tone,
        },
      });

      recordMetric("retry_job_enqueued", 1, {
        route: "/api/generate-email",
        jobType: "claude_generate_email",
      });

      return NextResponse.json(
        {
          message: "Email generation provider unavailable; queued for retry",
          queued: true,
          retryJob,
        },
        { status: 202 },
      );
    }

    const { data, error } = await context.supabase
      .from("ai_emails")
      .insert({
        organization_id: context.organizationId,
        campaign_id: body.campaignId ?? null,
        contact_id: body.contactId ?? null,
        subject: generated.subjectLine,
        body: generated.personalizedEmail,
        tone: normalizeTone(body.tone),
        language: "en",
        model_name: generated.model,
        status: "draft",
      })
      .select("id,subject,body,tone,status,model_name,created_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    logger.info("Email generated", {
      route: "/api/generate-email",
      organizationId: context.organizationId,
      aiEmailId: data.id,
      model: data.model_name,
    });
    recordMetric("email_generated_total", 1, {
      route: "/api/generate-email",
      tone: data.tone ?? "unknown",
    });

    return NextResponse.json({
      message: "Email generated",
      output: {
        subject_line: data.subject,
        personalized_email: data.body,
      },
      item: data,
    });
  } catch (error) {
    return apiErrorResponse(error, { route: "/api/generate-email" });
  }
}
