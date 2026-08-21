export type BookingRecord = {
  id: string;
  booking_number: string | null;
  status: string;
  booking_source?: string | null;

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

  venue_type: string | null;
  surface_type: string | null;
  power_available: boolean | null;
  generator_required: boolean;

  subtotal: number | string;
  modifiers_total: number | string;
  delivery_fee: number | string;
  discount_amount: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  deposit_amount: number | string;
  amount_paid: number | string;
  balance_due: number | string;

  payment_status: string;
  contract_status: string;

  delivery_status: string | null;
  pickup_status: string | null;

  coi_required: boolean;
  coi_status: string;
  ball_colors: string | null;

  customer_notes?: string | null;
  setup_photo_url?: string | null;
  pickup_photo_url?: string | null;

  created_at: string;
};

export type BookingItemComponent = {
  id: string;
  inventory_item_id: string;
  name: string;
  role: string;
  quantity: number | string;
  is_required: boolean;
  allow_substitution: boolean;
  notes: string | null;
};

export type BookingItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_description: string | null;

  product_short_description: string | null;
  product_image_url: string | null;
  product_gallery_urls: unknown[];

  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;

  variant_id: string | null;
  variant_name: string | null;

  quantity: number;
  unit_price: number | string;
  subtotal: number | string;

  setup_width_ft: number | string | null;
  setup_length_ft: number | string | null;
  setup_height_ft: number | string | null;

  min_age: number | null;
  max_age: number | null;
  max_capacity: number | null;

  item_components: BookingItemComponent[];
};

export type BookingModifier = {
  id: string;
  booking_item_id: string | null;

  modifier_id: string;
  modifier_name: string | null;
  modifier_description: string | null;

  group_id: string | null;
  group_name: string | null;
  group_description: string | null;

  option_id: string | null;
  option_name: string | null;
  option_description: string | null;

  image_url: string | null;

  quantity: number;
  unit_price: number | string;
  price_delta: number | string;
  subtotal: number | string;
  notes: string | null;

  /*
   * Backward-compatible aliases for older components.
   * Remove these after all usages have migrated to group_id / option_id.
   */
  modifier_group_id?: string | null;
  modifier_group_option_id?: string | null;
};

export type BookingContract = {
  id: string;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_date: string | null;
};

export type BookingPayment = {
  id: string;
  amount: number | string;
  tip_amount?: number | string | null;
  method: string;
  status: string;
  paid_at: string | null;
};

export type BookingPhoto = {
  id: string;
  photo_type: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
};


export type BookingRouteStop = {
  id: string;
  booking_id: string;
  stop_type: "delivery" | "pickup" | string;
  stop_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  status: string | null;
  sort_order: number | null;
  updated_at: string | null;
  created_at: string | null;
};

export type BookingDetails = {
  booking: BookingRecord;
  items: BookingItem[];
  modifiers: BookingModifier[];
  contract: BookingContract | null;
  payments: BookingPayment[];
  photos: BookingPhoto[];
  route_stops: BookingRouteStop[];
};
