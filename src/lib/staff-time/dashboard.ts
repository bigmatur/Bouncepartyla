export type StaffTimeBreak = {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_type: string;
};

export type StaffTimeEntry = {
  id: string;
  work_date?: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  status?: string | null;
  staff_time_breaks?: StaffTimeBreak[] | null;
};

export type StaffTimeHistoryRow = {
  id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  status: string;
  break_minutes: number;
};

export type StaffTimeDashboard = {
  current: StaffTimeEntry | null;
  history: StaffTimeHistoryRow[];
};

export async function getMyStaffTimeDashboard(
  supabase: any,
): Promise<StaffTimeDashboard> {
  const result = await supabase.rpc("get_my_staff_time_dashboard", {
    p_limit: 14,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const data = (result.data || {}) as Partial<StaffTimeDashboard>;

  return {
    current: data.current || null,
    history: Array.isArray(data.history) ? data.history : [],
  };
}
