"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ValidateModulePanelProps = {
  organizationId: string;
};

export function ValidateModulePanel({ organizationId }: ValidateModulePanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create upload record</CardTitle>
        <CardDescription>Register a CSV file in Supabase Storage and start validation processing.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => {
              void (async () => {
                const response = await fetch("/api/v1/validate/uploads", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    organizationId,
                    fileName: formData.get("fileName"),
                    filePath: formData.get("filePath"),
                    mimeType: formData.get("mimeType"),
                    rowCount: Number(formData.get("rowCount") ?? 0),
                  }),
                });

                const payload = (await response.json()) as { message?: string; error?: string };
                if (!response.ok) {
                  setMessage(payload.error ?? "Unable to create upload");
                  return;
                }
                setMessage(payload.message ?? "Upload registered");
                event.currentTarget.reset();
              })();
            });
          }}
        >
          <Input name="fileName" placeholder="contacts-june.csv" required />
          <Input name="filePath" placeholder="org-id/uploads/contacts-june.csv" required />
          <Input name="mimeType" placeholder="text/csv" defaultValue="text/csv" required />
          <Input name="rowCount" type="number" min={1} placeholder="250" required />
          <Button type="submit" className="md:col-span-2" disabled={isPending}>
            {isPending ? "Saving..." : "Create upload"}
          </Button>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
