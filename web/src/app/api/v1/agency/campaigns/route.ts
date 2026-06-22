import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

const createCampaignSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  module: z.enum(["validate", "signal", "agency"]),
  status: z.enum(["draft", "active", "paused", "completed"]).default("draft"),
  config: z.record(z.string(), z.unknown()).default({}),
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
      .from("campaigns")
      .select("id,name,module,status,config,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
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
    const body = createCampaignSchema.parse(await request.json());
    const { supabase, user, membership } = await requireOrganizationMembership(body.organizationId);

    if (!["owner", "admin", "member"].includes(membership.role)) {
      throw new ApiError(403, "You do not have permission to create campaigns");
    }

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        organization_id: body.organizationId,
        name: body.name,
        module: body.module,
        status: body.status,
        created_by: user.id,
        config: body.config,
      })
      .select("id,name,module,status,created_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ message: "Campaign created", item: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
