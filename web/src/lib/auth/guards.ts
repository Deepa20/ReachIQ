import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { type AppRole } from "@/types/database";

export type ActiveMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: AppRole;
};

export async function requireAuthenticatedUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireActiveMembership(): Promise<ActiveMembership> {
  const user = await requireAuthenticatedUser();
  const supabase = await getSupabaseServerClient();

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(id,name,slug)")
    .eq("user_id", user.id)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const membership = memberships?.[0] as
    | {
        role: AppRole;
        organizations: { id: string; name: string; slug: string };
      }
    | undefined;

  if (!membership) {
    redirect("/onboarding");
  }

  return {
    organizationId: membership.organizations.id,
    organizationName: membership.organizations.name,
    organizationSlug: membership.organizations.slug,
    role: membership.role,
  };
}
