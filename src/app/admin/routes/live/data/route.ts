import { NextResponse } from "next/server";
import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { loadDriverLiveDashboardData } from "../loadDriverLiveDashboardData";

export const runtime = "nodejs";

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateParam(value: string | null) {
  const raw = String(value || "").trim();

  if (!raw) {
    return todayISO();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("routes.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selectedDate = normalizeDateParam(searchParams.get("date"));

  if (!selectedDate) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const drivers = await loadDriverLiveDashboardData({
    supabase,
    selectedDate,
  });

  return NextResponse.json({
    selectedDate,
    drivers,
  });
}
