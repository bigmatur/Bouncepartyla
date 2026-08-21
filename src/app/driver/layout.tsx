import type { ReactNode } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { requireDriverInterfaceAccess } from "@/lib/auth/require-driver";

export const dynamic = "force-dynamic";

export default async function DriverLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { access } = await requireDriverInterfaceAccess();

  return (
    <div className="min-h-screen bg-[#f5efe6] text-[#1d1d1b]">
      <AdminShell
        displayName={access.displayName}
        userEmail={access.user?.email || null}
        role={access.role}
        defaultInterface={access.defaultInterface}
        availableInterfaces={access.availableInterfaces}
        grantedPermissions={access.grantedPermissions}
      >
        {children}
      </AdminShell>
    </div>
  );
}
