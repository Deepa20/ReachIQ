import { NextResponse } from "next/server";

import { apiErrorResponse, requireApiAuth } from "@/lib/api/auth-context";

export async function GET() {
  try {
    const { user } = await requireApiAuth();
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
