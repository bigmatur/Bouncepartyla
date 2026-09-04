import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AdminShell from "@/components/admin/AdminShell";
import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin App | Bounce Party LA",
  description: "Private administrative application for Bounce Party LA.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Admin App | Bounce Party LA",
    description: "Private administrative application for Bounce Party LA.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Admin App | Bounce Party LA",
    description: "Private administrative application for Bounce Party LA.",
  },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isActive || !isStaffRole(access.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-[#f5efe6] text-[#1d1d1b]">
      <AdminShell
        displayName={access.displayName}
        userEmail={access.user.email || null}
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