import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
