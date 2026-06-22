import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function requireApiAuth() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new ApiError(401, error.message);
  }

  if (!user) {
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
    throw new ApiError(500, error.message);
  }
  if (!membership) {
    throw new ApiError(403, "You are not a member of this organization");
  }

  return { supabase, user, membership };
}
