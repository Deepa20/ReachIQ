import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";

const createSignalSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  signalType: z.string().min(1),
  strength: z.number().int().min(1).max(5),
  summary: z.string().min(1),
  sourceUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
      .from("signals")
      .select("id,signal_type,strength,summary,source_url,metadata,detected_at")
      .eq("organization_id", organizationId)
      .order("detected_at", { ascending: false })
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
    const body = createSignalSchema.parse(await request.json());
    const { supabase } = await requireOrganizationMembership(body.organizationId);

    const { data, error } = await supabase
      .from("signals")
      .insert({
        organization_id: body.organizationId,
        company_id: body.companyId ?? null,
        signal_type: body.signalType,
        strength: body.strength,
        summary: body.summary,
        source_url: body.sourceUrl ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id,signal_type,strength,summary,detected_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ message: "Signal created", item: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
