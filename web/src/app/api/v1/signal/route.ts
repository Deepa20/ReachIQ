import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { SIGNAL_TYPES, calculateAccountSignalScore, calculateSignalEventScore } from "@/lib/signal/scoring";

const createSignalSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  signalType: z.enum(SIGNAL_TYPES),
  strength: z.number().int().min(1).max(5),
  summary: z.string().min(1),
  sourceUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const accountId = searchParams.get("accountId");
    const limitRaw = Number(searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100;

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);
    let query = supabase
      .from("signals")
      .select("id,account_id,company_id,signal_type,strength,signal_score,summary,source_url,metadata,detected_at,accounts(id,name,domain,industry,signal_score)")
      .eq("organization_id", organizationId)
      .order("detected_at", { ascending: false })
      .limit(limit);

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

export async function POST(request: Request) {
  try {
    const body = createSignalSchema.parse(await request.json());
    const { supabase, membership } = await requireOrganizationMembership(body.organizationId);

    if (!["owner", "admin", "member"].includes(membership.role)) {
      throw new ApiError(403, "You do not have permission to create signals");
    }

    const signalScore = calculateSignalEventScore(body.signalType, body.strength);

    const { data, error } = await supabase
      .from("signals")
      .insert({
        organization_id: body.organizationId,
        account_id: body.accountId ?? null,
        company_id: body.companyId ?? null,
        signal_type: body.signalType,
        strength: body.strength,
        signal_score: signalScore,
        summary: body.summary,
        source_url: body.sourceUrl ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id,account_id,signal_type,strength,signal_score,summary,detected_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    let previousScore: number | null = null;
    let newScore: number | null = null;

    if (body.accountId) {
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id,signal_score")
        .eq("organization_id", body.organizationId)
        .eq("id", body.accountId)
        .single();

      if (accountError) {
        throw new ApiError(500, accountError.message);
      }

      previousScore = account.signal_score ?? 0;
      newScore = calculateAccountSignalScore(previousScore, signalScore);

      const { error: updateAccountError } = await supabase
        .from("accounts")
        .update({
          signal_score: newScore,
          last_signal_at: data.detected_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.accountId)
        .eq("organization_id", body.organizationId);

      if (updateAccountError) {
        throw new ApiError(500, updateAccountError.message);
      }

      const { error: historyError } = await supabase.from("signal_history").insert({
        organization_id: body.organizationId,
        account_id: body.accountId,
        signal_id: data.id,
        event_type: "signal_detected",
        previous_score: previousScore,
        new_score: newScore,
        notes: body.summary.slice(0, 500),
        payload: {
          signalType: body.signalType,
          strength: body.strength,
          signalScore,
        },
        event_at: data.detected_at,
      });

      if (historyError) {
        throw new ApiError(500, historyError.message);
      }
    }

    return NextResponse.json({
      message: "Signal created",
      item: data,
      accountScore: newScore,
      previousScore,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
