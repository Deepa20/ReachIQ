"use client";

import { useEffect } from "react";
import Link from "next/link";

import { captureException } from "@/lib/observability/monitoring";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException("Global app error boundary", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-500">{error.message}</p>
      <div className="flex gap-2">
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={reset}>
          Retry
        </button>
        <Link href="/dashboard" className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
