import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { requireActiveMembership, requireAuthenticatedUser } from "@/lib/auth/guards";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const membership = await requireActiveMembership();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <DashboardSidebar organizationName={membership.organizationName} role={membership.role} />
        <div className="flex min-h-screen flex-1 flex-col">
          <DashboardHeader user={user} organizationName={membership.organizationName} />
          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
