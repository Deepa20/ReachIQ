import { NextResponse } from "next/server";

import { captureException } from "@/lib/observability/monitoring";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { count, error } = await supabase.from("retry_jobs").select("id", { count: "exact", head: true }).eq("status", "pending");

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: "ok",
      service: "reachiq-web-api",
      uptimeSeconds: Math.round(process.uptime()),
      queue: {
        pendingJobs: count ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    captureException("Health check failed", error);
    return NextResponse.json(
      {
        status: "degraded",
        service: "reachiq-web-api",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
