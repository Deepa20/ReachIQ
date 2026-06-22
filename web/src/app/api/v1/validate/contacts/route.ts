import { NextResponse } from "next/server";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const uploadId = searchParams.get("uploadId");

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);

    let query = supabase
      .from("validation_results")
      .select(
        "id,upload_id,contact_id,validation_status,score,reasons,validated_at,contacts(id,first_name,last_name,email,title,linkedin_url,metadata,companies(name,domain),enrichment_results(provider,payload,enriched_at))",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("validated_at", { ascending: false })
      .limit(200);

    if (uploadId) {
      query = query.eq("upload_id", uploadId);
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
