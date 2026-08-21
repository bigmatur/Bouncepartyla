export interface TaxRateResult {
  taxRate: number;
  taxAreaCode?: string | null;
  source: "cache" | "cdtfa" | "manual" | "zip_fallback";
  warning?: string;
}

export interface DeliveryCalculationInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  subtotal: number;
  vehicleSpaceUnits?: number;
  setupMinutes?: number;
}

export interface DeliveryCalculationResult {
  deliveryFee: number;
  source: "zone" | "distance" | "manual" | "fallback";
  zoneId?: string | null;
  distanceMiles?: number | null;
  driveMinutes?: number | null;
  warning?: string;
}

export interface PriceCalculationInput {
  rentalSubtotal: number;
  modifiersSubtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxRate: number;
  depositAmount: number;

  deliveryTaxable?: boolean;
  rentalTaxable?: boolean;
  modifiersTaxable?: boolean;
}

export interface PriceCalculationResult {
  rentalSubtotal: number;
  modifiersSubtotal: number;
  deliveryFee: number;
  discountAmount: number;

  taxableAmount: number;
  taxRate: number;
  taxAmount: number;

  totalAmount: number;
  depositAmount: number;
  balanceDue: number;
}