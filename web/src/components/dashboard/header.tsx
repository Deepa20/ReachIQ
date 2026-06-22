import { User } from "@supabase/supabase-js";

import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

type HeaderProps = {
  user: User;
  organizationName: string;
};

export function DashboardHeader({ user, organizationName }: HeaderProps) {
  const initials = (user.user_metadata.full_name as string | undefined)
    ?.split(" ")
    .map((token) => token[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-sm text-slate-500">Organization</p>
        <p className="font-semibold text-slate-900">{organizationName}</p>
      </div>
      <details className="relative">
        <summary className="list-none">
          <span className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials ?? "RQ"}
            </span>
            <span className="text-left text-sm">
              <span className="block font-medium text-slate-900">{(user.user_metadata.full_name as string | undefined) ?? "User"}</span>
              <span className="block text-slate-500">{user.email}</span>
            </span>
          </span>
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{organizationName}</p>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      </details>
    </header>
  );
}
