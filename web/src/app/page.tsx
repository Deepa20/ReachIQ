import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">ReachIQ</p>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Multi-tenant outreach platform for agencies and SMB teams</h1>
      <p className="max-w-xl text-slate-600">
        Authenticate with Supabase, manage tenant data with row-level security, and operate Validate, Signal, and Agency workflows from one dashboard.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Login
        </Link>
        <Link href="/sign-up" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Create account
        </Link>
      </div>
    </main>
  );
}
