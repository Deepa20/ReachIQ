import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireApiAuth } from "@/lib/api/auth-context";
import { enrichContact } from "@/lib/integrations/apollo";
import { generateClaudeHaikuEmail } from "@/lib/integrations/claude-haiku";
import { checkCatchAll, validateEmail, verifyDomain } from "@/lib/integrations/hunter";
import { captureException, recordMetric } from "@/lib/observability/monitoring";
import { logger } from "@/lib/observability/logger";
import { RETRY_JOB_TYPES, computeNextRetryAt } from "@/lib/queue/retry-queue";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const retryJobStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);

const retryJobSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  job_type: z.enum(RETRY_JOB_TYPES),
  payload: z.record(z.string(), z.unknown()),
  status: retryJobStatusSchema,
  attempt_count: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
});

const hunterPayloadSchema = z.object({
  email: z.string().email(),
});

const apolloPayloadSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
});

const claudePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  name: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  industry: z.string().min(1),
  signal: z.string().min(1),
  product_description: z.string().min(1),
  tone: z.enum(["Warm", "Direct", "Consultative", "Peer to Peer"]),
});

const processOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  jobType: z.enum(RETRY_JOB_TYPES).optional(),
});

async function processHunterJob(payloadRaw: Record<string, unknown>) {
  const payload = hunterPayloadSchema.parse(payloadRaw);
  const validation = await validateEmail(payload.email);
  const domain = await verifyDomain(payload.email.split("@")[1] ?? "");
  const catchAll = await checkCatchAll(payload.email, validation.raw);

  return {
    validation,
    domain,
    catchAll,
  };
}

async function processApolloJob(payloadRaw: Record<string, unknown>) {
  const payload = apolloPayloadSchema.parse(payloadRaw);
  return enrichContact(payload);
}

async function processClaudeJob(payloadRaw: Record<string, unknown>) {
  const payload = claudePayloadSchema.parse(payloadRaw);
  const generated = await generateClaudeHaikuEmail({
    name: payload.name,
    title: payload.title,
    company: payload.company,
    industry: payload.industry,
    signal: payload.signal,
    productDescription: payload.product_description,
    tone: payload.tone,
  });

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_emails")
    .insert({
      organization_id: payload.organizationId,
      campaign_id: payload.campaignId ?? null,
      contact_id: payload.contactId ?? null,
      subject: generated.subjectLine,
      body: generated.personalizedEmail,
      tone: payload.tone,
      language: "en",
      model_name: generated.model,
      status: "draft",
    })
    .select("id,subject,status,model_name,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    emailRecord: data,
  };
}

async function processJob(jobRaw: z.infer<typeof retryJobSchema>) {
  switch (jobRaw.job_type) {
    case "hunter_validate_contact":
      return processHunterJob(jobRaw.payload);
    case "apollo_enrich_contact":
      return processApolloJob(jobRaw.payload);
    case "claude_generate_email":
      return processClaudeJob(jobRaw.payload);
    default:
      throw new Error(`Unsupported retry job type: ${jobRaw.job_type}`);
  }
}

function isAuthorizedCronRequest(request: Request): boolean {
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  if (vercelCronHeader) {
    return true;
  }
  const configuredToken = process.env.RETRY_QUEUE_PROCESS_TOKEN;
  if (!configuredToken) {
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  return authHeader.slice("Bearer ".length) === configuredToken;
}

async function ensureAuthorized(request: Request) {
  if (isAuthorizedCronRequest(request)) {
    return;
  }
  await requireApiAuth();
}

async function processRetryQueue(limit: number, jobType?: z.infer<typeof processOptionsSchema>["jobType"]) {
  const supabase = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("retry_jobs")
    .select("id,organization_id,job_type,payload,status,attempt_count,max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (jobType) {
    query = query.eq("job_type", jobType);
  }

  const { data: jobs, error: fetchError } = await query;
  if (fetchError) {
    throw new ApiError(500, fetchError.message);
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const rawJob of jobs ?? []) {
    const parsed = retryJobSchema.parse(rawJob);
    const currentAttempt = parsed.attempt_count + 1;

    const { error: setProcessingError } = await supabase
      .from("retry_jobs")
      .update({
        status: "processing",
        attempt_count: currentAttempt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);

    if (setProcessingError) {
      results.push({ id: parsed.id, status: "failed", error: setProcessingError.message });
      continue;
    }

    try {
      const result = await processJob(parsed);

      const { error: completeError } = await supabase
        .from("retry_jobs")
        .update({
          status: "completed",
          last_error: null,
          last_result: result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsed.id);

      if (completeError) {
        throw completeError;
      }

      recordMetric("retry_job_completed", 1, {
        jobType: parsed.job_type,
      });
      results.push({ id: parsed.id, status: "completed" });
    } catch (error) {
      const terminalFailure = currentAttempt >= parsed.max_attempts;
      const nextStatus = terminalFailure ? "failed" : "pending";

      const { error: markFailedError } = await supabase
        .from("retry_jobs")
        .update({
          status: nextStatus,
          next_attempt_at: terminalFailure ? new Date().toISOString() : computeNextRetryAt(currentAttempt),
          last_error: error instanceof Error ? error.message : "Unknown retry error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsed.id);

      if (markFailedError) {
        captureException("Unable to update retry job failure status", markFailedError, { retryJobId: parsed.id });
      }

      logger.warn("Retry job failed", {
        retryJobId: parsed.id,
        jobType: parsed.job_type,
        attempt: currentAttempt,
        maxAttempts: parsed.max_attempts,
        terminalFailure,
        error,
      });
      recordMetric("retry_job_failed", 1, {
        jobType: parsed.job_type,
        terminalFailure,
      });
      results.push({
        id: parsed.id,
        status: nextStatus,
        error: error instanceof Error ? error.message : "Unknown retry error",
      });
    }
  }

  return {
    attempted: jobs?.length ?? 0,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    rescheduled: results.filter((result) => result.status === "pending").length,
    results,
  };
}

export async function GET(request: Request) {
  try {
    await ensureAuthorized(request);
    const { searchParams } = new URL(request.url);
    const options = processOptionsSchema.parse({
      limit: Number(searchParams.get("limit") ?? 20),
      jobType: searchParams.get("jobType") ?? undefined,
    });
    const summary = await processRetryQueue(options.limit, options.jobType);

    return NextResponse.json({
      message: "Retry queue processed",
      summary,
    });
  } catch (error) {
    return apiErrorResponse(error, { route: "/api/v1/ops/retry-queue/process" });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAuthorized(request);
    const body = (await request.json()) as Record<string, unknown>;
    const options = processOptionsSchema.parse({
      limit: typeof body.limit === "number" ? body.limit : 20,
      jobType: typeof body.jobType === "string" ? body.jobType : undefined,
    });
    const summary = await processRetryQueue(options.limit, options.jobType);

    return NextResponse.json({
      message: "Retry queue processed",
      summary,
    });
  } catch (error) {
    return apiErrorResponse(error, { route: "/api/v1/ops/retry-queue/process" });
  }
}
