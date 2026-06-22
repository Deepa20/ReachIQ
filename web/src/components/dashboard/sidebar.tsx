 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, RadioTower, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SidebarProps = {
  organizationName: string;
  role: string;
};

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/validate", label: "ReachIQ Validate", icon: ShieldCheck },
  { href: "/dashboard/signal", label: "ReachIQ Signal", icon: RadioTower },
  { href: "/dashboard/agency", label: "ReachIQ Agency", icon: Building2 },
];

export function DashboardSidebar({ organizationName, role }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-6 md:block">
      <div className="mb-10 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <p className="font-semibold text-slate-900">ReachIQ</p>
        </div>
        <p className="text-sm text-slate-500">{organizationName}</p>
        <Badge variant="secondary">{role}</Badge>
      </div>
      <nav className="space-y-1">
        {links.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
