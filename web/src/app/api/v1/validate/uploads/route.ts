import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

const createUploadSchema = z.object({
  organizationId: z.string().uuid(),
  fileName: z.string().min(1),
  filePath: z.string().min(1),
  mimeType: z.string().optional(),
  rowCount: z.number().int().min(1),
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
      .from("uploads")
      .select("id,file_name,file_path,row_count,status,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

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
    const body = createUploadSchema.parse(await request.json());
    const { supabase, user } = await requireOrganizationMembership(body.organizationId);

    const { data, error } = await supabase
      .from("uploads")
      .insert({
        organization_id: body.organizationId,
        uploaded_by: user.id,
        file_name: body.fileName,
        file_path: body.filePath,
        mime_type: body.mimeType ?? null,
        row_count: body.rowCount,
        status: "pending",
      })
      .select("id,file_name,file_path,status")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({
      message: "Upload created",
      item: data,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
