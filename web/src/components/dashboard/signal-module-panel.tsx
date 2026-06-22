"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SignalModulePanelProps = {
  organizationId: string;
};

export function SignalModulePanel({ organizationId }: SignalModulePanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create signal</CardTitle>
        <CardDescription>Capture an account-intent event with strength scoring and source metadata.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const response = await fetch("/api/v1/signal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId,
                  signalType: formData.get("signalType"),
                  strength: Number(formData.get("strength") ?? 1),
                  summary: formData.get("summary"),
                  sourceUrl: formData.get("sourceUrl"),
                }),
              });

              const payload = (await response.json()) as { message?: string; error?: string };
              if (!response.ok) {
                setMessage(payload.error ?? "Unable to create signal");
                return;
              }
              setMessage(payload.message ?? "Signal created");
              event.currentTarget.reset();
            });
          }}
        >
          <Input name="signalType" placeholder="funding_event" required />
          <Input name="strength" type="number" min={1} max={5} placeholder="5" required />
          <Input name="sourceUrl" type="url" placeholder="https://news.example.com/article" />
          <Textarea name="summary" placeholder="Company announced a Series A round and is hiring GTM roles." required />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Create signal"}
          </Button>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
