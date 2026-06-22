import { AgencyModulePanel } from "@/components/dashboard/agency-module-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function AgencyPage() {
  const membership = await requireActiveMembership();
  const supabase = await getSupabaseServerClient();

  const [{ data: campaigns, error: campaignError }, { data: subscriptions, error: subscriptionError }, { data: aiEmails, error: aiEmailsError }] = await Promise.all([
    supabase.from("campaigns").select("id,name,module,status,created_at").eq("organization_id", membership.organizationId).order("created_at", { ascending: false }).limit(25),
    supabase.from("subscriptions").select("id,plan_code,status,seats_included,current_period_end").eq("organization_id", membership.organizationId).limit(1),
    supabase
      .from("ai_emails")
      .select("id,subject,body,tone,status,model_name,created_at")
      .eq("organization_id", membership.organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (campaignError) {
    throw new Error(campaignError.message);
  }
  if (subscriptionError) {
    throw new Error(subscriptionError.message);
  }
  if (aiEmailsError) {
    throw new Error(aiEmailsError.message);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ReachIQ Agency</h1>
        <p className="text-sm text-slate-500">Manage client campaigns, seat allocation, and tenant subscription controls.</p>
      </div>

      <AgencyModulePanel organizationId={membership.organizationId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Data from `campaigns` table</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns?.length ? (
              campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-medium text-slate-900">{campaign.name}</p>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </div>
                  <p className="text-slate-500">{campaign.module}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No campaigns yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Data from `subscriptions` table</CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions?.length ? (
              <article className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{subscriptions[0].plan_code}</p>
                <p className="text-slate-500">Status: {subscriptions[0].status}</p>
                <p className="text-slate-500">Seats: {subscriptions[0].seats_included}</p>
              </article>
            ) : (
              <p className="text-sm text-slate-500">No subscription record yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent AI emails</CardTitle>
          <CardDescription>Data from `ai_emails` table generated via Claude Haiku integration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiEmails?.length ? (
            aiEmails.map((email) => (
              <article key={email.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{email.subject}</p>
                  <Badge variant="secondary">{email.status}</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {email.tone ?? "Unknown tone"} · {email.model_name ?? "Claude Haiku"} · {new Date(email.created_at).toLocaleString()}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-slate-600">{email.body}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No AI emails generated yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
