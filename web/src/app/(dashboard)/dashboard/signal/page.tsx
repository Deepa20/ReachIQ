import { SignalModulePanel } from "@/components/dashboard/signal-module-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { SIGNAL_TYPES, type SignalType } from "@/lib/signal/scoring";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const signalLabel: Record<SignalType, string> = {
  funding: "Funding",
  job_posting: "Job posting",
  company_news: "Company news",
  executive_change: "Executive change",
  technology_change: "Technology change",
};

export default async function SignalPage() {
  const membership = await requireActiveMembership();
  const supabase = await getSupabaseServerClient();

  const [{ data: monitoredAccounts, error: accountsError }, { data: signals, error: signalsError }, { data: timeline, error: timelineError }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,domain,industry,monitoring_enabled,signal_score,last_signal_at")
      .eq("organization_id", membership.organizationId)
      .order("signal_score", { ascending: false })
      .limit(50),
    supabase
      .from("signals")
      .select("id,account_id,signal_type,strength,signal_score,summary,source_url,detected_at,accounts(id,name,domain)")
      .eq("organization_id", membership.organizationId)
      .order("detected_at", { ascending: false })
      .limit(50),
    supabase
      .from("signal_history")
      .select("id,event_type,previous_score,new_score,notes,event_at,accounts(id,name,domain),signals(signal_type,strength,signal_score)")
      .eq("organization_id", membership.organizationId)
      .order("event_at", { ascending: false })
      .limit(100),
  ]);

  if (accountsError) throw new Error(accountsError.message);
  if (signalsError) throw new Error(signalsError.message);
  if (timelineError) throw new Error(timelineError.message);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ReachIQ Signal</h1>
        <p className="text-sm text-slate-500">Target account monitoring for funding, hiring, news, executive, and technology signals.</p>
      </div>

      <SignalModulePanel
        organizationId={membership.organizationId}
        accounts={
          monitoredAccounts?.map((account) => ({
            id: account.id,
            name: account.name,
            domain: account.domain,
            signal_score: account.signal_score,
            monitoring_enabled: account.monitoring_enabled,
          })) ?? []
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signal feed</CardTitle>
            <CardDescription>Real-time account events from `signals` table.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signals?.length ? (
              signals.map((signal) => {
                const account = Array.isArray(signal.accounts) ? signal.accounts[0] : signal.accounts;
                const label = SIGNAL_TYPES.includes(signal.signal_type as SignalType) ? signalLabel[signal.signal_type as SignalType] : signal.signal_type;
                return (
                  <article key={signal.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-900">
                        {label} · {account?.name ?? "Unmapped account"}
                      </p>
                      <Badge variant={signal.strength >= 4 ? "warning" : "secondary"}>Strength {signal.strength}</Badge>
                    </div>
                    <p className="text-slate-700">{signal.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Event score {signal.signal_score} · {new Date(signal.detected_at).toLocaleString()}
                    </p>
                    {signal.source_url ? (
                      <a href={signal.source_url} className="text-sky-700 underline underline-offset-4" target="_blank" rel="noreferrer">
                        Source
                      </a>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No signal feed items yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal score</CardTitle>
            <CardDescription>Account prioritization from monitored target accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monitoredAccounts?.length ? (
              monitoredAccounts.map((account) => (
                <article key={account.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-medium text-slate-900">{account.name}</p>
                    <Badge variant={account.signal_score >= 70 ? "warning" : "secondary"}>Score {account.signal_score}</Badge>
                  </div>
                  <p className="text-slate-500">
                    {account.domain} · {account.industry}
                  </p>
                  <p className="text-xs text-slate-500">{account.last_signal_at ? `Last signal: ${new Date(account.last_signal_at).toLocaleString()}` : "No signals yet"}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No monitored accounts yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signal timeline</CardTitle>
          <CardDescription>Score transitions and event history from `signal_history`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeline?.length ? (
            timeline.map((event) => {
              const account = Array.isArray(event.accounts) ? event.accounts[0] : event.accounts;
              const signal = Array.isArray(event.signals) ? event.signals[0] : event.signals;
              const signalType = signal?.signal_type;
              const signalTypeLabel =
                signalType && SIGNAL_TYPES.includes(signalType as SignalType) ? signalLabel[signalType as SignalType] : signalType ?? "N/A";

              return (
                <article key={event.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{account?.name ?? "Account"} · {event.event_type}</p>
                    <Badge variant="secondary">{new Date(event.event_at).toLocaleString()}</Badge>
                  </div>
                  <p className="text-slate-600">
                    {event.previous_score ?? 0} → {event.new_score ?? 0}
                  </p>
                  <p className="text-slate-500">
                    {signalTypeLabel} {signal?.strength ? `(strength ${signal.strength})` : ""}
                  </p>
                  {event.notes ? <p className="mt-1 text-slate-700">{event.notes}</p> : null}
                </article>
              );
            })
          ) : (
            <p className="text-sm text-slate-500">No timeline events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
