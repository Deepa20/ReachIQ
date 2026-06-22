import { User } from "@supabase/supabase-js";

import { signOutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials ?? "RQ"}</AvatarFallback>
            </Avatar>
            <span className="text-left text-sm">
              <span className="block font-medium text-slate-900">{(user.user_metadata.full_name as string | undefined) ?? "User"}</span>
              <span className="block text-slate-500">{user.email}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{organizationName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
