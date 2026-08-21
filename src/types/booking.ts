export type BookingStatus =
  | "draft"
  | "quote"
  | "pending_deposit"
  | "booked"
  | "scheduled"
  | "inventory_reserved"
  | "picking"
  | "loaded"
  | "out_for_delivery"
  | "installed"
  | "pickup_scheduled"
  | "picked_up"
  | "returned"
  | "cleaning"
  | "closed"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "refunded"
  | "failed";

export type ContractStatus =
  | "not_sent"
  | "sent"
  | "viewed"
  | "signed"
  | "expired"
  | "cancelled";

export type VenueType =
  | "backyard"
  | "park"
  | "indoor_venue"
  | "school"
  | "church"
  | "other";

export type SurfaceType =
  | "grass"
  | "concrete"
  | "turf"
  | "asphalt"
  | "indoor_floor"
  | "mixed"
  | "unknown";

export interface Customer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  default_address: string | null;
  default_city: string | null;
  default_state: string | null;
  default_zip: string | null;
  notes: string | null;
  warning_notes: string | null;
  total_bookings: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  booking_number: string | null;

  customer_id: string | null;

  status: BookingStatus;

  event_date: string;
  event_start_time: string | null;
  event_end_time: string | null;

  delivery_date: string | null;
  pickup_date: string | null;

  delivery_window_start: string | null;
  delivery_window_end: string | null;

  pickup_window_start: string | null;
  pickup_window_end: string | null;

  setup_address: string | null;
  setup_city: string | null;
  setup_state: string | null;
  setup_zip: string | null;

  venue_type: VenueType | null;
  surface_type: SurfaceType | null;

  power_available: boolean | null;
  generator_required: boolean;

  exact_setup_location: string | null;
  gate_code: string | null;
  parking_notes: string | null;

  subtotal: number;
  modifiers_total: number;
  delivery_fee: number;
  discount_amount: number;

  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;

  total_amount: number;
  deposit_amount: number;
  amount_paid: number;
  balance_due: number;

  payment_status: PaymentStatus;
  contract_status: ContractStatus;

  customer_notes: string | null;
  internal_notes: string | null;

  created_by: string | null;

  created_at: string;
  updated_at: string;
}

export interface BookingItem {
  id: string;
  booking_id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  taxable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingModifier {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  modifier_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  taxable: boolean;
  notes: string | null;
  created_at: string;
}