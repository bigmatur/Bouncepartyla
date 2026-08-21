export type InventoryTrackingType = "serialized" | "quantity" | "kit";

export type InventoryUnitStatus =
  | "available"
  | "reserved"
  | "picked"
  | "loaded"
  | "out_for_delivery"
  | "installed"
  | "returned"
  | "dirty"
  | "cleaning"
  | "maintenance"
  | "damaged"
  | "missing"
  | "retired";

export type InventoryReservationStatus =
  | "reserved"
  | "picked"
  | "loaded"
  | "delivered"
  | "installed"
  | "returned"
  | "consumed"
  | "released"
  | "missing"
  | "damaged";

export interface InventoryItem {
  id: string;
  category_id: string | null;

  name: string;
  sku: string | null;

  tracking_type: InventoryTrackingType;

  total_quantity: number;
  unit_label: string | null;

  active: boolean;

  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface InventoryUnit {
  id: string;

  inventory_item_id: string;
  warehouse_id: string | null;

  unit_code: string;

  status: InventoryUnitStatus;
  condition: string | null;

  last_cleaned_at: string | null;
  last_maintenance_at: string | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface InventoryRecipe {
  id: string;

  product_id: string;
  modifier_id: string | null;

  inventory_item_id: string;

  quantity_required: number;

  requirement_type: "required" | "optional" | "conditional" | "alternative";

  alternative_group: string | null;

  is_optional: boolean;

  inventory_behavior?: "reusable" | "consumable";

  notes: string | null;

  created_at: string;
}

export interface InventoryReservation {
  id: string;

  booking_id: string;
  booking_item_id: string | null;

  inventory_item_id: string;
  inventory_unit_id: string | null;

  quantity: number;

  reserved_from: string;
  reserved_until: string;

  status: InventoryReservationStatus;

  inventory_behavior?: "reusable" | "consumable";
  consumed_at?: string | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
}