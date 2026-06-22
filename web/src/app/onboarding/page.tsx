import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createOrganizationAction(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "");
  const slug = slugify(name);
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: organization, error } = await supabase.from("organizations").insert({ name, slug, owner_user_id: user.id }).select("id").single();

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  const { error: membershipError } = await supabase.from("organization_members").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      role: "owner",
    },
    {
      onConflict: "organization_id,user_id",
    },
  );

  if (membershipError) {
    redirect(`/onboarding?error=${encodeURIComponent(membershipError.message)}`);
  }

  redirect("/dashboard");
}

type OnboardingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create your first organization</CardTitle>
          <CardDescription>ReachIQ uses organization-level tenancy and RLS for data isolation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <form action={createOrganizationAction} className="space-y-3">
            <Input name="name" placeholder="Acme Agency" required />
            <Button type="submit">Create organization</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
