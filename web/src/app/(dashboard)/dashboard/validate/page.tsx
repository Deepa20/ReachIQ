import { ValidateModulePanel } from "@/components/dashboard/validate-module-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveMembership } from "@/lib/auth/guards";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

function validationVariant(status: string): "success" | "warning" | "danger" {
  if (status === "valid") return "success";
  if (status === "risky") return "warning";
  return "danger";
}

export default async function ValidatePage() {
  const membership = await requireActiveMembership();
  const supabase = await getSupabaseServerClient();

  const [{ data: uploads, error: uploadsError }, { data: validationResults, error: resultsError }] = await Promise.all([
    supabase
      .from("uploads")
      .select("id,file_name,row_count,status,created_at")
      .eq("organization_id", membership.organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("validation_results")
      .select("id,validation_status,score,classification,reasons,validated_at,contacts(id,first_name,last_name,email,title,metadata,companies(name,domain),enrichment_results(provider,payload,enriched_at))")
      .eq("organization_id", membership.organizationId)
      .is("deleted_at", null)
      .order("validated_at", { ascending: false })
      .limit(100),
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
            <CardTitle>Processed contacts</CardTitle>
            <CardDescription>Validation status, score, and contact detail from the pipeline.</CardDescription>
          </CardHeader>
          <CardContent>
            {validationResults?.length ? (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Contact Detail</th>
                      <th className="px-3 py-2">Validation Status</th>
                      <th className="px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResults.map((result) => {
                      const contact = Array.isArray(result.contacts) ? result.contacts[0] : result.contacts;
                      const contactRecord = contact as {
                        first_name?: string | null;
                        last_name?: string | null;
                        email?: string | null;
                        title?: string | null;
                        metadata?: { classification?: string } | null;
                        companies?: { name?: string | null } | Array<{ name?: string | null }> | null;
                      } | null;
                      const company = contactRecord?.companies;
                      const companyName = Array.isArray(company) ? company[0]?.name : company?.name;
                      const fullName = [contactRecord?.first_name, contactRecord?.last_name].filter(Boolean).join(" ");
                      const classification = result.classification ?? contactRecord?.metadata?.classification ?? "N/A";
                      return (
                        <tr key={result.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-900">{contactRecord?.email ?? "Unknown email"}</p>
                            <p className="text-slate-500">
                              {fullName || "Unknown"} • {contactRecord?.title || "No title"} • {companyName || "No company"}
                            </p>
                            <p className="text-slate-400">{new Date(result.validated_at).toLocaleString()}</p>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={validationVariant(result.validation_status)}>{result.validation_status.toUpperCase()}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">{result.score}</p>
                            <p className="text-slate-500">{classification}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No processed contacts yet. Upload a CSV to run the pipeline.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
