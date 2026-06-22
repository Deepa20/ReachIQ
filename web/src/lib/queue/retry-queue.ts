import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const RETRY_JOB_TYPES = ["hunter_validate_contact", "apollo_enrich_contact", "claude_generate_email"] as const;

export type RetryJobType = (typeof RETRY_JOB_TYPES)[number];

export type RetryJobPayload = Record<string, unknown>;

function getMaxRetries(): number {
  const parsed = Number(process.env.RETRY_QUEUE_MAX_ATTEMPTS ?? "5");
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.floor(parsed);
}

function getBackoffBaseSeconds(): number {
  const parsed = Number(process.env.RETRY_QUEUE_BASE_DELAY_SECONDS ?? "30");
  if (!Number.isFinite(parsed) || parsed < 1) return 30;
  return Math.floor(parsed);
}

export function computeNextRetryAt(attemptCount: number): string {
  const delay = Math.min(3600, getBackoffBaseSeconds() * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delay * 1000).toISOString();
}

export async function enqueueRetryJob(input: {
  organizationId: string;
  jobType: RetryJobType;
  payload: RetryJobPayload;
  maxAttempts?: number;
  nextAttemptAt?: string;
}) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("retry_jobs")
    .insert({
      organization_id: input.organizationId,
      job_type: input.jobType,
      payload: input.payload,
      status: "pending",
      max_attempts: input.maxAttempts ?? getMaxRetries(),
      attempt_count: 0,
      next_attempt_at: input.nextAttemptAt ?? new Date().toISOString(),
    })
    .select("id,job_type,status,attempt_count,max_attempts,next_attempt_at")
    .single();

  if (error) {
    throw new Error(`Unable to enqueue retry job: ${error.message}`);
  }

  return data;
}
