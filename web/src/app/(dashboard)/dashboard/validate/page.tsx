import { ValidateModulePanel } from "@/components/dashboard/validate-module-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function ValidatePage() {
  const membership = await requireActiveMembership();
  const supabase = await getSupabaseServerClient();

  const [{ data: uploads, error: uploadsError }, { data: validationResults, error: resultsError }] = await Promise.all([
    supabase.from("uploads").select("id,file_name,row_count,status,created_at").eq("organization_id", membership.organizationId).order("created_at", { ascending: false }).limit(20),
    supabase.from("validation_results").select("id,validation_status,score,validated_at").eq("organization_id", membership.organizationId).order("validated_at", { ascending: false }).limit(20),
  ]);

  if (uploadsError) {
    throw new Error(uploadsError.message);
  }
  if (resultsError) {
    throw new Error(resultsError.message);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ReachIQ Validate</h1>
        <p className="text-sm text-slate-500">Upload management, validation outcomes, and enrichment-ready records.</p>
      </div>

      <ValidateModulePanel organizationId={membership.organizationId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent uploads</CardTitle>
            <CardDescription>Data from `uploads` table</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploads?.length ? (
              uploads.map((upload) => (
                <article key={upload.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{upload.file_name}</p>
                    <Badge variant="secondary">{upload.status}</Badge>
                  </div>
                  <p className="text-slate-500">{upload.row_count} rows</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No uploads yet. Use the API form above to create the first record.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validation results</CardTitle>
            <CardDescription>Data from `validation_results` table</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {validationResults?.length ? (
              validationResults.map((result) => (
                <article key={result.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{result.validation_status}</p>
                    <p className="text-slate-500">Score {result.score}</p>
                  </div>
                  <p className="text-slate-500">{new Date(result.validated_at).toLocaleString()}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No validation results yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
