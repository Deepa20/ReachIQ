import { NextResponse } from "next/server";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const accountId = searchParams.get("accountId");

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);

    let query = supabase
      .from("signal_history")
      .select("id,account_id,signal_id,event_type,previous_score,new_score,notes,payload,event_at,accounts(id,name,domain),signals(signal_type,strength,signal_score,summary)")
      .eq("organization_id", organizationId)
      .order("event_at", { ascending: false })
      .limit(200);

    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
