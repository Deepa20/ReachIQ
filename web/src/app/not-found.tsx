import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">The requested route does not exist in this ReachIQ workspace.</p>
      <Link href="/dashboard" className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        Back to dashboard
      </Link>
    </main>
  );
}
