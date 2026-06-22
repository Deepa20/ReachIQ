import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export type UsageMetric = {
  label: string;
  value: number;
};

export async function getUsageMetrics(organizationId: string): Promise<UsageMetric[]> {
  const supabase = await getSupabaseServerClient();

  const [{ count: contacts }, { count: signals }, { count: campaigns }, { count: uploads }] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("signals").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("uploads").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  return [
    { label: "Contacts", value: contacts ?? 0 },
    { label: "Signals", value: signals ?? 0 },
    { label: "Campaigns", value: campaigns ?? 0 },
    { label: "Uploads", value: uploads ?? 0 },
  ];
}
