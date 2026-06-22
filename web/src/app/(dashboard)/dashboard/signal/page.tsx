import { SignalModulePanel } from "@/components/dashboard/signal-module-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function SignalPage() {
  const membership = await requireActiveMembership();
  const supabase = await getSupabaseServerClient();

  const { data: signals, error } = await supabase
    .from("signals")
    .select("id,signal_type,strength,summary,source_url,detected_at")
    .eq("organization_id", membership.organizationId)
    .order("detected_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ReachIQ Signal</h1>
        <p className="text-sm text-slate-500">Track intent events, timing signals, and trigger-ready outreach opportunities.</p>
      </div>

      <SignalModulePanel organizationId={membership.organizationId} />

      <Card>
        <CardHeader>
          <CardTitle>Signal timeline</CardTitle>
          <CardDescription>Data from `signals` table</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {signals?.length ? (
            signals.map((signal) => (
              <article key={signal.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium text-slate-900">{signal.signal_type}</p>
                  <Badge variant={signal.strength >= 4 ? "warning" : "secondary"}>Strength {signal.strength}</Badge>
                </div>
                <p className="text-slate-700">{signal.summary}</p>
                <p className="mt-1 text-slate-500">{new Date(signal.detected_at).toLocaleString()}</p>
                {signal.source_url ? (
                  <a href={signal.source_url} className="text-sky-700 underline underline-offset-4" target="_blank" rel="noreferrer">
                    Source
                  </a>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No signals recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
