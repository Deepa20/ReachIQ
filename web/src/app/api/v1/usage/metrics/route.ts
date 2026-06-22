import { NextResponse } from "next/server";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { getUsageMetrics } from "@/lib/data/usage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    await requireOrganizationMembership(organizationId);
    const metrics = await getUsageMetrics(organizationId);
    return NextResponse.json({ items: metrics });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
