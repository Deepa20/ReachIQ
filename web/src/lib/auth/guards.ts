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
        organizations: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }>;
      }
    | undefined;

  if (!membership) {
    redirect("/onboarding");
  }

  const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;

  if (!organization) {
    redirect("/onboarding");
  }

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    role: membership.role,
  };
}
