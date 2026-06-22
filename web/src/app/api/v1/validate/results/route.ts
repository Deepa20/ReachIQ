import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { classifyReachIqScore } from "@/services/scoring";

const createValidationResultSchema = z.object({
  organizationId: z.string().uuid(),
  uploadId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  validationStatus: z.enum(["valid", "risky", "invalid"]),
  score: z.number().int().min(0).max(100),
  classification: z.enum(["HOT", "WARM", "COLD"]).optional(),
  reasons: z.array(z.string()).default([]),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const uploadId = searchParams.get("uploadId");

    if (!organizationId || !uploadId) {
      throw new ApiError(400, "organizationId and uploadId are required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);
    const { data, error } = await supabase
      .from("validation_results")
      .select("id,validation_status,score,classification,reasons,validated_at,contact_id,contacts(id,first_name,last_name,email,title,linkedin_url,metadata)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("upload_id", uploadId)
      .order("validated_at", { ascending: false });

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
    const body = createValidationResultSchema.parse(await request.json());
    const { supabase } = await requireOrganizationMembership(body.organizationId);
    const classification = body.classification ?? classifyReachIqScore(body.score);

    const { data, error } = await supabase
      .from("validation_results")
      .insert({
        organization_id: body.organizationId,
        upload_id: body.uploadId,
        contact_id: body.contactId ?? null,
        validation_status: body.validationStatus,
        score: body.score,
        classification,
        reasons: body.reasons,
        deleted_at: null,
      })
      .select("id,validation_status,score,classification,validated_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ message: "Validation result stored", item: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
