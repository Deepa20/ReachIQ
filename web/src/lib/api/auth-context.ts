import { NextResponse } from "next/server";

import { captureException, recordMetric } from "@/lib/observability/monitoring";
import { logger } from "@/lib/observability/logger";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export class ApiError extends Error {
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    public readonly status: number,
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.code = options?.code;
    this.details = options?.details;
  }
}

export function apiErrorResponse(error: unknown, context?: { route?: string; requestId?: string }) {
  const errorId = crypto.randomUUID();

  if (error instanceof ApiError) {
    logger.warn("Handled API error", {
      errorId,
      route: context?.route ?? "unknown",
      requestId: context?.requestId ?? "unknown",
      status: error.status,
      code: error.code,
      details: error.details,
      message: error.message,
    });
    recordMetric("api_error_total", 1, {
      route: context?.route ?? "unknown",
      status: error.status,
      code: error.code ?? "api_error",
    });
    return NextResponse.json(
      {
        error: error.message,
        errorId,
        code: error.code,
      },
      { status: error.status },
    );
  }

  captureException("Unhandled API error", error, {
    errorId,
    route: context?.route ?? "unknown",
    requestId: context?.requestId ?? "unknown",
  });
  recordMetric("api_error_total", 1, {
    route: context?.route ?? "unknown",
    status: 500,
    code: "internal_error",
  });

  return NextResponse.json(
    {
      error: "Internal server error",
      errorId,
    },
    { status: 500 },
  );
}

export async function requireApiAuth() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    logger.warn("Authentication error from Supabase", { error });
    throw new ApiError(401, error.message);
  }

  if (!user) {
    logger.warn("Missing authenticated user");
    throw new ApiError(401, "Authentication required");
  }

  return { supabase, user };
}

export async function requireOrganizationMembership(organizationId: string) {
  const { supabase, user } = await requireApiAuth();
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("id,role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logger.error("Membership lookup failed", { organizationId, userId: user.id, error });
    throw new ApiError(500, error.message);
  }
  if (!membership) {
    logger.warn("User is not organization member", { organizationId, userId: user.id });
    throw new ApiError(403, "You are not a member of this organization");
  }

  return { supabase, user, membership };
}
