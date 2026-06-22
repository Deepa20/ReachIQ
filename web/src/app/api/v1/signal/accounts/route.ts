import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

const createAccountSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().min(1),
  industry: z.string().min(1),
  companyId: z.string().uuid().nullable().optional(),
  monitoringEnabled: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);
    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,domain,industry,company_id,monitoring_enabled,signal_score,last_signal_at,created_at")
      .eq("organization_id", organizationId)
      .order("signal_score", { ascending: false })
      .limit(100);

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createAccountSchema.parse(await request.json());
    const { supabase, membership } = await requireOrganizationMembership(body.organizationId);

    if (!["owner", "admin", "member"].includes(membership.role)) {
      throw new ApiError(403, "You do not have permission to add monitored accounts");
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        organization_id: body.organizationId,
        company_id: body.companyId ?? null,
        name: body.name,
        domain: body.domain.toLowerCase(),
        industry: body.industry,
        monitoring_enabled: body.monitoringEnabled,
        signal_score: 0,
      })
      .select("id,name,domain,industry,signal_score,monitoring_enabled,created_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    const { error: historyError } = await supabase.from("signal_history").insert({
      organization_id: body.organizationId,
      account_id: data.id,
      signal_id: null,
      event_type: "account_started",
      previous_score: null,
      new_score: 0,
      notes: "Target account monitoring started",
      payload: {
        domain: data.domain,
        industry: data.industry,
      },
    });

    if (historyError) {
      throw new ApiError(500, historyError.message);
    }

    return NextResponse.json({ message: "Target account added", item: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
