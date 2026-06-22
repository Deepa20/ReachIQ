import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type UsageMetric } from "@/lib/data/usage";

type UsageMetricsProps = {
  metrics: UsageMetric[];
};

export function UsageMetrics({ metrics }: UsageMetricsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-500">{metric.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{metric.value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
