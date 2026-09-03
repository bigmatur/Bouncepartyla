export type BusinessAnalyticsRange = {
  from: string;
  to: string;
};

export type BusinessOverviewComparison = {
  bookedRevenue: number;
  bookingCount: number;
  averageBookingValue: number;
  discounts: number;
  deliveryRevenue: number;
};

export type BusinessOverviewDelta = {
  bookedRevenuePct: number | null;
  bookingCountPct: number | null;
  averageBookingValuePct: number | null;
  discountsPct: number | null;
  deliveryRevenuePct: number | null;
};

export type BusinessOverviewComparisonSnapshot = {
  current: BusinessOverviewComparison;
  previous: BusinessOverviewComparison;
  delta: BusinessOverviewDelta;
};

export type BusinessCashFlowComparison = {
  currentCollected: number;
  previousCollected: number;
  collectedDeltaPct: number | null;
  currentCollectionRate: number;
  previousCollectionRate: number;
  collectionRateDeltaPoints: number;
};

export type BusinessTrendComparisonRow = {
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentBookings: number;
  previousBookings: number;
};

export type BusinessDriverRow = {
  key: string;
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentBookings: number;
  previousBookings: number;
  deltaPct: number | null;
};

export type BusinessComparisonMetric = {
  current: number;
  previous: number;
  deltaPct: number | null;
};

export type BusinessSalesValueBandRow = {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
  bookingCount: number;
  revenue: number;
  revenueSharePct: number;
};

export type BusinessSalesWeekdayRow = {
  dayIndex: number;
  dayName: string;
  revenue: number;
  bookings: number;
  averageBookingValue: number;
  revenueSharePct: number;
};

export type BusinessSalesGeographyInsightRow = {
  key: string;
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentBookings: number;
  previousBookings: number;
  currentAverageBooking: number;
  previousAverageBooking: number;
  currentRevenueSharePct: number;
  previousRevenueSharePct: number;
  revenueDeltaPct: number | null;
};

export type BusinessFutureBookedRevenueHorizon = {
  days: number;
  bookingCount: number;
  revenue: number;
  averageBookingValue: number;
};

export type BusinessSalesInsights = {
  summary: {
    revenue: BusinessComparisonMetric;
    bookings: BusinessComparisonMetric;
    averageBooking: BusinessComparisonMetric;
    discounts: BusinessComparisonMetric;
    discountedBookingShare: BusinessComparisonMetric;
    discountRate: BusinessComparisonMetric;
    averageDiscountPerDiscountedBooking: BusinessComparisonMetric;
    deliveryRevenue: BusinessComparisonMetric;
    deliveryRevenueShare: BusinessComparisonMetric;
    medianBookingValue: BusinessComparisonMetric;
    highValueBookingShare: BusinessComparisonMetric;
  };
  trend: BusinessTrendComparisonRow[];
  valueBands: BusinessSalesValueBandRow[];
  weekdays: BusinessSalesWeekdayRow[];
  cities: BusinessSalesGeographyInsightRow[];
  zips: BusinessSalesGeographyInsightRow[];
  growingCities: BusinessSalesGeographyInsightRow[];
  decliningCities: BusinessSalesGeographyInsightRow[];
  concentration: {
    topCityShare: BusinessComparisonMetric;
    top3CityShare: BusinessComparisonMetric;
    top5CityShare: BusinessComparisonMetric;
    top10BookingsShare: BusinessComparisonMetric;
  };
  futureBookedRevenue: {
    asOfDate: string;
    horizons: BusinessFutureBookedRevenueHorizon[];
  };
  forwardBookingPace: {
    futureBookingsCreatedCount: number;
    futureRevenueCreated: number;
  };
  opportunityPipeline: {
    count: number;
    potentialAmount: number | null;
    statuses: string[];
  };
  cancellationSnapshot: {
    cancelledCount: number;
    refundedCount: number;
    cancelledSharePct: number;
    refundedSharePct: number;
  };
  thresholds: {
    minGeographyBookingsForDelta: number;
    highValueBookingThreshold: number;
  };
  signals: BusinessSignal[];
};

export type BusinessCoverageLevel = "high" | "partial" | "limited";

export type BusinessCustomerCoverageMetric = {
  linked: number;
  total: number;
  coveragePct: number;
  level: BusinessCoverageLevel;
};

export type BusinessCustomerConfidencePanel = {
  bookingIdentityCoverage: BusinessCustomerCoverageMetric;
  revenueIdentityCoverage: BusinessCustomerCoverageMetric;
  leadLinkageCoverage: BusinessCustomerCoverageMetric;
  crmIdentityCoverage: BusinessCustomerCoverageMetric | null;
};

export type BusinessCustomerMixSnapshot = {
  identifiedCustomers: number;
  firstEventCustomers: number;
  returningCustomers: number;
  returningRevenue: number;
  returningRevenueSharePct: number;
};

export type BusinessCustomerAcquisitionSnapshot = {
  newCustomers: number;
  repeatCustomersBookingInPeriod: number;
  revenueFromNewCustomers: number;
  revenueFromRepeatCustomers: number;
  repeatRevenueSharePct: number;
  repeatBookingSharePct: number;
};

export type BusinessCustomerRepeatBehavior = {
  createdIntervalAvgDays: number | null;
  createdIntervalMedianDays: number | null;
  eventIntervalAvgDays: number | null;
  eventIntervalMedianDays: number | null;
  timeToSecondAvgDays: number | null;
  timeToSecondMedianDays: number | null;
  observedCustomers: number;
  repeatWindows: Array<{
    days: number;
    eligibleCustomers: number;
    repeatedWithinWindow: number;
    repeatRatePct: number | null;
  }>;
};

export type BusinessTopCustomerRow = {
  customerId: string;
  customerName: string;
  lifetimeBookedRevenue: number;
  lifetimeBookingCount: number;
  averageBookingValue: number;
  firstBookingCreatedAt: string | null;
  firstEventDate: string | null;
  mostRecentBookingCreatedAt: string | null;
  repeatStatus: "repeat" | "single";
};

export type BusinessCustomerConcentrationSnapshot = {
  denominatorRevenue: number;
  top1Share: BusinessComparisonMetric;
  top5Share: BusinessComparisonMetric;
  top10Share: BusinessComparisonMetric;
};

export type BusinessCustomerGeographyRow = {
  key: string;
  label: string;
  identifiedCustomers: number;
  returningCustomers: number;
  repeatCustomerSharePct: number;
  totalRevenue: number;
  returningRevenue: number;
};

export type BusinessLeadSourceRow = {
  source: string;
  linkedBookings: number;
  linkedRevenue: number;
};

export type BusinessCustomerInsights = {
  confidence: BusinessCustomerConfidencePanel;
  identity: {
    linkedBookings: number;
    totalBookings: number;
    linkedRevenue: number;
    totalRevenue: number;
    distinctCustomerIds: number;
    unidentifiedBookings: number;
  };
  eventMix: {
    current: BusinessCustomerMixSnapshot;
    previous: BusinessCustomerMixSnapshot;
  };
  acquisition: {
    current: BusinessCustomerAcquisitionSnapshot;
    previous: BusinessCustomerAcquisitionSnapshot;
  };
  topCustomers: BusinessTopCustomerRow[];
  concentration: BusinessCustomerConcentrationSnapshot;
  repeatBehavior: BusinessCustomerRepeatBehavior;
  geography: BusinessCustomerGeographyRow[];
  leadSources: {
    coverage: {
      linkedBookings: number;
      totalBookings: number;
      coveragePct: number;
      adequate: boolean;
    };
    rows: BusinessLeadSourceRow[];
    multiSourceBookingCount: number;
  };
  signals: BusinessSignal[];
};


export type BusinessMetaAdsSummary = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  messagingConversations: number;
  ctr: number;
  cpc: number | null;
  cpm: number | null;
  cpl: number | null;
  costPerMessagingConversation: number | null;
};

export type BusinessMarketingCampaignRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messagingConversations: number;
  ctr: number;
  cpc: number | null;
  cpl: number | null;
  costPerMessagingConversation: number | null;
};

export type BusinessMarketingDailyRow = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messagingConversations: number;
  ctr: number;
  cpl: number | null;
  costPerMessagingConversation: number | null;
};

export type BusinessMetaAdsSnapshot = {
  connection: {
    configured: boolean;
    source: "database" | "environment" | "none";
    adAccountId: string;
    graphVersion: string;
    error: string | null;
  };
  current: BusinessMetaAdsSummary | null;
  previous: BusinessMetaAdsSummary | null;
  campaigns: BusinessMarketingCampaignRow[];
  daily: BusinessMarketingDailyRow[];
};

export type BusinessMarketingLeadSourceRow = {
  source: string;
  leads: number;
  linkedRevenueBookings: number;
  linkedBookedRevenue: number;
  conversionPct: number;
  previousLeads?: number;
  leadDeltaPct?: number | null;
};

export type BusinessMarketingInsights = {
  metaAds: BusinessMetaAdsSnapshot;
  comparisons: {
    spend: BusinessComparisonMetric;
    impressions: BusinessComparisonMetric;
    clicks: BusinessComparisonMetric;
    leads: BusinessComparisonMetric;
    messagingConversations: BusinessComparisonMetric;
    ctr: BusinessComparisonMetric;
    cpc: BusinessComparisonMetric | null;
    cpl: BusinessComparisonMetric | null;
    costPerMessagingConversation: BusinessComparisonMetric | null;
  } | null;
  leadSources: BusinessMarketingLeadSourceRow[];
  leadSummary: {
    leads: number;
    linkedLeads: number;
    linkageCoveragePct: number;
    previousLeads: number;
    leadDeltaPct: number | null;
  };
  attribution: {
    campaignRevenueAttributionAvailable: boolean;
    roasAvailable: boolean;
    reason: string;
  };
  signals: BusinessSignal[];
};

export type BusinessSignal = {
  id: string;
  type: string;
  severity: "info" | "positive" | "warning" | "critical";
  title: string;
  explanation: string;
  currentValue?: number;
  previousValue?: number;
  deltaPct?: number | null;
};

export type BusinessUtilizationConfidence =
  | "available"
  | "partial"
  | "unsupported";

export type BusinessProductComparisonRow = {
  productId: string;
  productName: string;
  categoryName: string;
  currentRevenue: number;
  previousRevenue: number;
  revenueDeltaPct: number | null;
  currentRentals: number;
  previousRentals: number;
  rentalDeltaPct: number | null;
  currentBookingCount: number;
  previousBookingCount: number;
  revenuePerRental: number;
  revenueSharePct: number;
};

export type BusinessProductCategoryRow = {
  categoryName: string;
  revenue: number;
  rentals: number;
  bookingCount: number;
  revenueSharePct: number;
};

export type BusinessProductUtilizationRow = {
  productId: string;
  productName: string;
  categoryName: string;
  inventoryModel: string;
  confidence: BusinessUtilizationConfidence;
  availableCapacity: number | null;
  peakReservedCapacity: number | null;
  peakUtilizationPct: number | null;
  periodUtilizationPct: number | null;
  reservedCapacityDays: number | null;
  availableCapacityDays: number | null;
  highUtilizationDays: number | null;
  capacityHitDays: number | null;
  reservationObservationCount: number | null;
  statusKind:
    | "unsupported"
    | "measured"
    | "review"
    | "high_pressure"
    | "low_utilization";
  statusLabel: string;
  unsupportedReason: string | null;
};

export type BusinessProductCombinationRow = {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  bookingCount: number;
};

export type BusinessProductInsights = {
  minRentalActivityForGrowth: number;
  totals: {
    productCount: number;
    measurableUtilizationCount: number;
    totalRevenue: number;
    totalRentals: number;
    totalDistinctProductBookings: number;
    uncategorizedRevenue: number;
    uncategorizedRevenueSharePct: number;
    categoryCoverageLimited: boolean;
  };
  rows: BusinessProductComparisonRow[];
  leaders: {
    topRevenue: BusinessProductComparisonRow[];
    mostRented: BusinessProductComparisonRow[];
    fastestGrowing: BusinessProductComparisonRow[];
    largestDecline: BusinessProductComparisonRow[];
  };
  categories: BusinessProductCategoryRow[];
  utilizationRows: BusinessProductUtilizationRow[];
  combinations: BusinessProductCombinationRow[];
  signals: BusinessSignal[];
};
