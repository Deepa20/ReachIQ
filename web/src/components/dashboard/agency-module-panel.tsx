"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AgencyModulePanelProps = {
  organizationId: string;
};

type GenerateEmailPayload = {
  organizationId: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  signal: string;
  product_description: string;
  tone: "Warm" | "Direct" | "Consultative" | "Peer to Peer";
};

type GeneratedEmail = {
  id: string;
  subject: string;
  body: string;
  tone: string | null;
  status: string;
  model_name: string | null;
  created_at: string;
};

const TONE_OPTIONS: GenerateEmailPayload["tone"][] = ["Warm", "Direct", "Consultative", "Peer to Peer"];

export function AgencyModulePanel({ organizationId }: AgencyModulePanelProps) {
  const router = useRouter();
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [latestEmail, setLatestEmail] = useState<GeneratedEmail | null>(null);
  const [lastPayload, setLastPayload] = useState<GenerateEmailPayload | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGeneratingTransition] = useTransition();

  const submitGenerateEmail = (payload: GenerateEmailPayload) => {
    setLastPayload(payload);

    startGeneratingTransition(() => {
      void (async () => {
        const response = await fetch("/api/generate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const responsePayload = (await response.json()) as {
          message?: string;
          error?: string;
          item?: GeneratedEmail;
        };

        if (!response.ok) {
          setEmailMessage(responsePayload.error ?? "Unable to generate email");
          return;
        }

        setLatestEmail(responsePayload.item ?? null);
        setEmailMessage(responsePayload.message ?? "Email generated");
        router.refresh();
      })();
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create campaign</CardTitle>
          <CardDescription>Manage multi-client outreach campaigns through the Agency module API.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);

              startTransition(() => {
                void (async () => {
                  const response = await fetch("/api/v1/agency/campaigns", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      organizationId,
                      name: formData.get("name"),
                      module: formData.get("module"),
                      status: formData.get("status"),
                      config: {
                        objective: formData.get("objective"),
                      },
                    }),
                  });

                  const payload = (await response.json()) as { message?: string; error?: string };
                  if (!response.ok) {
                    setCampaignMessage(payload.error ?? "Unable to create campaign");
                    return;
                  }
                  setCampaignMessage(payload.message ?? "Campaign created");
                  event.currentTarget.reset();
                  router.refresh();
                })();
              });
            }}
          >
            <Input name="name" placeholder="Q3 Pipeline Sprint" required />
            <Input name="module" placeholder="agency" defaultValue="agency" required />
            <Input name="status" placeholder="draft" defaultValue="draft" required />
            <Textarea name="objective" placeholder="Improve reply rate for agency client segment." />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Create campaign"}
            </Button>
          </form>
          {campaignMessage ? <p className="mt-3 text-sm text-slate-600">{campaignMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate personalized email</CardTitle>
          <CardDescription>Claude Haiku generation with tone control and persistence to `ai_emails`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const payload: GenerateEmailPayload = {
                organizationId,
                name: String(formData.get("name") ?? ""),
                title: String(formData.get("title") ?? ""),
                company: String(formData.get("company") ?? ""),
                industry: String(formData.get("industry") ?? ""),
                signal: String(formData.get("signal") ?? ""),
                product_description: String(formData.get("product_description") ?? ""),
                tone: String(formData.get("tone") ?? "Warm") as GenerateEmailPayload["tone"],
              };
              submitGenerateEmail(payload);
            }}
          >
            <Input name="name" placeholder="Prospect name" required />
            <Input name="title" placeholder="Prospect title" required />
            <Input name="company" placeholder="Prospect company" required />
            <Input name="industry" placeholder="Industry" required />
            <Textarea name="signal" placeholder="Signal (e.g., raised Series A, hiring SDRs)." required />
            <Textarea name="product_description" placeholder="What your product does and why it matters." required />
            <label className="block text-sm font-medium text-slate-700" htmlFor="tone">
              Tone
            </label>
            <select
              id="tone"
              name="tone"
              className="block w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
              defaultValue="Warm"
            >
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate email"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isGenerating || !lastPayload}
                onClick={() => {
                  if (!lastPayload) return;
                  submitGenerateEmail(lastPayload);
                }}
              >
                {isGenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </form>

          {emailMessage ? <p className="text-sm text-slate-600">{emailMessage}</p> : null}

          {latestEmail ? (
            <article className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {latestEmail.tone ?? "Tone"} · {latestEmail.model_name ?? "Claude Haiku"}
              </p>
              <p className="mt-1 font-semibold text-slate-900">Subject: {latestEmail.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-slate-700">{latestEmail.body}</p>
            </article>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
