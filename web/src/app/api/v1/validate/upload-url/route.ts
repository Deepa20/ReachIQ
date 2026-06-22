import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

const uploadUrlSchema = z.object({
  organizationId: z.string().uuid(),
  fileName: z.string().min(1),
});

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function POST(request: Request) {
  try {
    const body = uploadUrlSchema.parse(await request.json());
    const { supabase } = await requireOrganizationMembership(body.organizationId);
    const storagePath = `${body.organizationId}/uploads/${Date.now()}-${safeFileName(body.fileName)}`;

    const { data, error } = await supabase.storage.from("uploads").createSignedUploadUrl(storagePath);

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({
      message: "Signed upload URL created",
      storagePath,
      ...data,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
