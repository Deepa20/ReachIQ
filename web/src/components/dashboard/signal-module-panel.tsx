"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SIGNAL_TYPES, type SignalType } from "@/lib/signal/scoring";

type SignalModulePanelProps = {
  organizationId: string;
  accounts: Array<{
    id: string;
    name: string;
    domain: string;
    signal_score: number;
    monitoring_enabled: boolean;
  }>;
};

const SIGNAL_LABELS: Record<SignalType, string> = {
  funding: "Funding",
  job_posting: "Job posting",
  company_news: "Company news",
  executive_change: "Executive change",
  technology_change: "Technology change",
};

export function SignalModulePanel({ organizationId, accounts }: SignalModulePanelProps) {
  const router = useRouter();
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [signalMessage, setSignalMessage] = useState<string | null>(null);
  const [isAccountPending, startAccountTransition] = useTransition();
  const [isSignalPending, startSignalTransition] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Target account monitoring</CardTitle>
          <CardDescription>Add accounts to monitor for key buying signals.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);

              startAccountTransition(() => {
                void (async () => {
                  const response = await fetch("/api/v1/signal/accounts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      organizationId,
                      name: formData.get("name"),
                      domain: formData.get("domain"),
                      industry: formData.get("industry"),
                      monitoringEnabled: true,
                    }),
                  });

                  const payload = (await response.json()) as { message?: string; error?: string };
                  if (!response.ok) {
                    setAccountMessage(payload.error ?? "Unable to add account");
                    return;
                  }
                  setAccountMessage(payload.message ?? "Account added");
                  event.currentTarget.reset();
                  router.refresh();
                })();
              });
            }}
          >
            <Input name="name" placeholder="Acme Corp" required />
            <Input name="domain" placeholder="acme.com" required />
            <Input name="industry" placeholder="Fintech" required />
            <Button type="submit" disabled={isAccountPending}>
              {isAccountPending ? "Adding..." : "Add account"}
            </Button>
          </form>
          {accountMessage ? <p className="mt-3 text-sm text-slate-600">{accountMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log account signal</CardTitle>
          <CardDescription>Capture funding, hiring, news, executive, and technology changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);

              startSignalTransition(() => {
                void (async () => {
                  const response = await fetch("/api/v1/signal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      organizationId,
                      accountId: formData.get("accountId"),
                      signalType: formData.get("signalType"),
                      strength: Number(formData.get("strength") ?? 3),
                      summary: formData.get("summary"),
                      sourceUrl: formData.get("sourceUrl"),
                    }),
                  });

                  const payload = (await response.json()) as { message?: string; error?: string };
                  if (!response.ok) {
                    setSignalMessage(payload.error ?? "Unable to create signal");
                    return;
                  }
                  setSignalMessage(payload.message ?? "Signal captured");
                  event.currentTarget.reset();
                  router.refresh();
                })();
              });
            }}
          >
            <label className="block text-sm font-medium text-slate-700" htmlFor="accountId">
              Account
            </label>
            <select id="accountId" name="accountId" className="block w-full rounded-md border border-slate-200 bg-white p-2 text-sm" required>
              <option value="">Select target account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.domain}) · Score {account.signal_score}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-slate-700" htmlFor="signalType">
              Signal type
            </label>
            <select id="signalType" name="signalType" className="block w-full rounded-md border border-slate-200 bg-white p-2 text-sm" defaultValue="funding">
              {SIGNAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SIGNAL_LABELS[type]}
                </option>
              ))}
            </select>
            <Input name="strength" type="number" min={1} max={5} placeholder="3" required />
            <Input name="sourceUrl" type="url" placeholder="https://news.example.com/article" />
            <Textarea name="summary" placeholder="Company announced a Series A round and opened 8 GTM roles." required />
            <Button type="submit" disabled={isSignalPending || !accounts.length}>
              {isSignalPending ? "Saving..." : "Create signal"}
            </Button>
          </form>
          {signalMessage ? <p className="mt-3 text-sm text-slate-600">{signalMessage}</p> : null}
          {!accounts.length ? <p className="mt-3 text-sm text-slate-500">Add a target account before creating signals.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
