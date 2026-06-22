"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ValidateModulePanelProps = {
  organizationId: string;
};

type PipelineResponse = {
  message: string;
  summary: {
    total: number;
    valid: number;
    risky: number;
    invalid: number;
    hot: number;
    warm: number;
    cold: number;
  };
  contacts: Array<{
    contactId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    title: string | null;
    validationStatus: "valid" | "risky" | "invalid";
    score: number;
    temperature: "HOT" | "WARM" | "COLD";
    reasons: string[];
  }>;
};

function validationVariant(status: "valid" | "risky" | "invalid"): "success" | "warning" | "danger" {
  if (status === "valid") return "success";
  if (status === "risky") return "warning";
  return "danger";
}

export function ValidateModulePanel({ organizationId }: ValidateModulePanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pipelineOutput, setPipelineOutput] = useState<PipelineResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CSV and run validation pipeline</CardTitle>
        <CardDescription>Upload CSV → Parse → Validate → Enrich → Score → Save.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const currentTarget = event.currentTarget;
            const formData = new FormData(currentTarget);
            formData.set("organizationId", organizationId);

            startTransition(() => {
              void (async () => {
                const response = await fetch("/api/v1/validate/uploads", {
                  method: "POST",
                  body: formData,
                });

                const payload = (await response.json()) as PipelineResponse & { error?: string; message?: string };
                if (!response.ok) {
                  setMessage(payload.error ?? "Unable to create upload");
                  setPipelineOutput(null);
                  return;
                }
                setMessage(payload.message ?? "Upload processed");
                setPipelineOutput(payload);
                currentTarget.reset();
                router.refresh();
              })();
            });
          }}
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Processing..." : "Upload and process CSV"}
          </Button>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}

        {pipelineOutput ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <article className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="text-slate-500">Total</p>
                <p className="text-lg font-semibold">{pipelineOutput.summary.total}</p>
              </article>
              <article className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="text-slate-500">Valid / Risky / Invalid</p>
                <p className="text-lg font-semibold">
                  {pipelineOutput.summary.valid} / {pipelineOutput.summary.risky} / {pipelineOutput.summary.invalid}
                </p>
              </article>
              <article className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="text-slate-500">Hot / Warm / Cold</p>
                <p className="text-lg font-semibold">
                  {pipelineOutput.summary.hot} / {pipelineOutput.summary.warm} / {pipelineOutput.summary.cold}
                </p>
              </article>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Contact detail</th>
                    <th className="px-3 py-2">Validation Status</th>
                    <th className="px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineOutput.contacts.map((contact) => (
                    <tr key={contact.contactId} className="border-t border-slate-200">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{contact.email}</p>
                        <p className="text-slate-500">
                          {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown"} • {contact.title || "No title"} •{" "}
                          {contact.company || "No company"}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={validationVariant(contact.validationStatus)}>{contact.validationStatus.toUpperCase()}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900">{contact.score}</p>
                        <p className="text-slate-500">{contact.temperature}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
