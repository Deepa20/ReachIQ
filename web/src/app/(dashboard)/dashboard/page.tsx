import { ModuleSummaryCard } from "@/components/dashboard/module-summary-card";
import { UsageMetrics } from "@/components/dashboard/usage-metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { getUsageMetrics } from "@/lib/data/usage";

export default async function DashboardPage() {
  const membership = await requireActiveMembership();
  const metrics = await getUsageMetrics(membership.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Monitor workspace usage across Validate, Signal, and Agency workflows.</p>
      </div>
      <UsageMetrics metrics={metrics} />
      <section className="grid gap-4 xl:grid-cols-3">
        <ModuleSummaryCard
          title="ReachIQ Validate"
          description="Manage uploads, validation results, and enrichment outcomes with tenant-level controls."
          href="/dashboard/validate"
        />
        <ModuleSummaryCard
          title="ReachIQ Signal"
          description="Track account signals, prioritize intent events, and sync follow-up workflows."
          href="/dashboard/signal"
        />
        <ModuleSummaryCard
          title="ReachIQ Agency"
          description="Coordinate campaigns, AI drafts, and subscription usage across agency clients."
          href="/dashboard/agency"
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>API-first architecture</CardTitle>
          <CardDescription>All module actions are available through versioned `/api/v1/*` endpoints.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Validate module: `/api/v1/validate/uploads`, `/api/v1/validate/results`</li>
            <li>Signal module: `/api/v1/signal`</li>
            <li>Agency module: `/api/v1/agency/campaigns`</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
