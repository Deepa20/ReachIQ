import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireApiAuth, requireOrganizationMembership } from "@/lib/api/auth-context";
import { generateClaudeHaikuEmail, type OutreachTone } from "@/lib/integrations/claude-haiku";

const toneSchema = z.enum(["Warm", "Direct", "Consultative", "Peer to Peer"]);

const generateEmailSchema = z.object({
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  name: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  industry: z.string().min(1),
  signal: z.string().min(1),
  product_description: z.string().min(1),
  tone: toneSchema,
});

type MembershipContext = {
  organizationId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof requireApiAuth>>["supabase"];
};

async function resolveMembershipContext(organizationId: string | undefined): Promise<MembershipContext> {
  if (organizationId) {
    const { supabase, membership } = await requireOrganizationMembership(organizationId);
    return {
      organizationId,
      role: membership.role,
      supabase,
    };
  }

  const { supabase, user } = await requireApiAuth();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id)
    .limit(2);

  if (error) {
    throw new ApiError(500, error.message);
  }

  if (!data?.length) {
    throw new ApiError(403, "You are not a member of any organization");
  }

  if (data.length > 1) {
    throw new ApiError(400, "organizationId is required when you belong to multiple organizations");
  }

  return {
    organizationId: data[0].organization_id,
    role: data[0].role,
    supabase,
  };
}

function assertCanGenerate(role: string) {
  if (!["owner", "admin", "member"].includes(role)) {
    throw new ApiError(403, "You do not have permission to generate emails");
  }
}

function normalizeTone(tone: OutreachTone): string {
  return tone;
}

export async function POST(request: Request) {
  try {
    const body = generateEmailSchema.parse(await request.json());
    const context = await resolveMembershipContext(body.organizationId);
    assertCanGenerate(context.role);

    const generated = await generateClaudeHaikuEmail({
      name: body.name,
      title: body.title,
      company: body.company,
      industry: body.industry,
      signal: body.signal,
      productDescription: body.product_description,
      tone: body.tone,
    });

    const { data, error } = await context.supabase
      .from("ai_emails")
      .insert({
        organization_id: context.organizationId,
        campaign_id: body.campaignId ?? null,
        contact_id: body.contactId ?? null,
        subject: generated.subjectLine,
        body: generated.personalizedEmail,
        tone: normalizeTone(body.tone),
        language: "en",
        model_name: generated.model,
        status: "draft",
      })
      .select("id,subject,body,tone,status,model_name,created_at")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({
      message: "Email generated",
      output: {
        subject_line: data.subject,
        personalized_email: data.body,
      },
      item: data,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
