import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ message: "Logged out" });
}
