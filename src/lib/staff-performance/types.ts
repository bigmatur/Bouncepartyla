export type PeriodPreset = "day" | "week" | "month" | "custom";

export type DateRange = {
  from: string;
  to: string;
};

export type ResolvedPeriod = {
  preset: PeriodPreset;
  range: DateRange;
  label: string;
  anchorDate: string;
  compareWithPrevious: boolean;
  comparisonRange: DateRange | null;
  errors: string[];
};

export type StaffShiftRow = {
  id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  status: string;
  break_minutes: number;
  paid_minutes: number;
  on_break: boolean;
};

export type WorkingEmployeeRow = {
  profile_id: string;
  display_name: string;
  role: string;
  paid_minutes: number;
  break_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  doubletime_minutes: number;
  shift_count: number;
  working_now: boolean;
  on_break: boolean;
  current_clock_in: string | null;
  shifts: StaffShiftRow[];
};

export type WorkingTimeReport = {
  from: string;
  to: string;
  summary?: {
    working_now?: number;
    paid_minutes?: number;
    break_minutes?: number;
    open_shifts?: number;
    stale_open_shifts?: number;
  };
  employees: WorkingEmployeeRow[];
  unlinked_driver_shifts?: Array<{
    id: string;
    route_driver_id: string;
    driver_name: string;
    work_date: string;
    clock_in_at: string;
    clock_out_at: string | null;
    source: string;
    status: string;
    needs_review: boolean;
  }>;
};

export type RouteStopRow = {
  id: string;
  booking_id: string | null;
  stop_date: string | null;
  stop_type: string | null;
  status: string | null;
  driver_name: string | null;
  customer_name: string | null;
  items_summary: string | null;
  setup_notes: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  balance_due: number | null;
  payment_collected: boolean | null;
  proof_photo_required: boolean | null;
  proof_photo_uploaded: boolean | null;
  created_at: string | null;
};

export type BookingItemRow = {
  booking_id: string;
  quantity: number | null;
  products: {
    category_id: string | null;
    name: string | null;
  } | null;
};

export type ChecklistItemRow = {
  booking_id: string;
  loaded: boolean | null;
  installed: boolean | null;
  picked_up: boolean | null;
  returned: boolean | null;
};

export type HandoverRow = {
  booking_id: string | null;
  status: string | null;
};

export type DriverDirectoryEntry = {
  driverKey: string;
  name: string;
  profileId: string | null;
  normalizedName: string;
};

export type ExceptionItem = {
  id: string;
  type:
    | "late_stop"
    | "stale_open_shift"
    | "missing_required_delivery_proof"
    | "incomplete_route"
    | "invalid_arrival_completion_pair"
    | "very_long_on_site";
  dateTime: string;
  driverName: string;
  reference: string;
  description: string;
  href: string | null;
};

export type DayTimeUsage = {
  date: string;
  workingMinutes: number;
  breakMinutes: number;
  onSiteMinutes: number;
  betweenStopsMinutes: number;
  unclassifiedMinutes: number;
  timingCoverageLabel: string;
};

export type DayStopSummary = {
  date: string;
  deliveries: number;
  pickups: number;
  completed: number;
  failed: number;
  cancelled: number;
  lateStops: number;
  onTimeStops: number;
  punctualityEligibleStops: number;
  productsHandled: number;
  exceptions: number;
};

export type DriverPerformanceMetrics = {
  workingMinutes: number;
  completedStops: number;
  deliveries: number;
  pickups: number;
  onTimePercent: number | null;
  onTimeStops: number;
  lateStops: number;
  averageLateMinutes: number | null;
  maxLateMinutes: number | null;
  explicitBreakMinutes: number;
  onSiteMinutes: number;
  averageOnSiteMinutes: number | null;
  averageDeliveryOnSiteMinutes: number | null;
  averagePickupOnSiteMinutes: number | null;
  onSiteCoverageLabel: string;
  betweenStopsMinutes: number | null;
  betweenStopsCoverageLabel: string;
  unclassifiedMinutes: number;
  productsHandled: number;
  exceptions: number;
};

export type DriverOperationalQuality = {
  requiredDeliveryProofCompleted: number;
  requiredDeliveryProofUploaded: number;
  checklistExpectedChecks: number;
  checklistCompletedChecks: number;
  requiredDeliverySignatureStops: number;
  requiredDeliverySignatureCompleted: number;
  paymentReportEligibleStops: number;
  paymentReportedStops: number;
};

export type DriverPerformanceDetail = {
  driver: DriverDirectoryEntry;
  metrics: DriverPerformanceMetrics;
  quality: DriverOperationalQuality;
  categoryBreakdown: Array<{ category: string; quantity: number }>;
  dayUsage: DayTimeUsage[];
  dayStops: DayStopSummary[];
  exceptions: ExceptionItem[];
  dayTimeline: {
    date: string;
    segments: Array<{
      kind: "shift" | "break" | "on_site" | "between_stops" | "unclassified";
      startAt: string;
      endAt: string;
      minutes: number;
      label: string;
      stopId?: string;
      stopType?: string | null;
      scheduledStartTime?: string | null;
      scheduledEndTime?: string | null;
      arrivedAt?: string | null;
      completedAt?: string | null;
    }>;
  } | null;
};

export type DriverPerformanceSnapshot = {
  period: DateRange;
  drivers: DriverDirectoryEntry[];
  selectedDriverKey: string | null;
  selectedDriverName: string | null;
  teamMetrics: DriverPerformanceMetrics;
  teamQuality: DriverOperationalQuality;
  teamDayUsage: DayTimeUsage[];
  teamDayStops: DayStopSummary[];
  teamCategoryBreakdown: Array<{ category: string; quantity: number }>;
  teamExceptions: ExceptionItem[];
  perDriver: DriverPerformanceDetail[];
};

export type DriverPerformancePageData = {
  snapshot: DriverPerformanceSnapshot;
  comparisonSnapshot: DriverPerformanceSnapshot | null;
  selectedDriver: DriverPerformanceDetail | null;
  comparisonSelectedDriver: DriverPerformanceDetail | null;
  staleShiftCount: number;
  unlinkedDriverShiftCount: number;
  notes: string[];
};
