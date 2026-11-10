import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return errorResponse(401, "Unauthorized");

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return errorResponse(500, "Server Supabase configuration is missing.");
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return errorResponse(401, "Invalid or expired session.");
  }

  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role)) {
    return errorResponse(403, "Your staff account does not have mobile access.");
  }

  return NextResponse.json({
    success: true,
    data: {
      interface: access.defaultInterface,
      role: access.role || "driver",
      displayName: access.displayName,
      grantedPermissions: access.grantedPermissions,
      availableInterfaces: access.availableInterfaces,
    },
  });
}
