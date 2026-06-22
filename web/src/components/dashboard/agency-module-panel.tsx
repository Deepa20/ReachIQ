"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AgencyModulePanelProps = {
  organizationId: string;
};

export function AgencyModulePanel({ organizationId }: AgencyModulePanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
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

            startTransition(async () => {
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
                setMessage(payload.error ?? "Unable to create campaign");
                return;
              }
              setMessage(payload.message ?? "Campaign created");
              event.currentTarget.reset();
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
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
