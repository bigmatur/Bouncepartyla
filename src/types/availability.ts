export type AvailabilityStatus = "available" | "limited" | "unavailable";

export type AvailabilityReason =
  | "available"
  | "product_not_active"
  | "no_recipe"
  | "no_serialized_units"
  | "missing_components"
  | "missing_alternative_group"
  | "delivery_capacity_full"
  | "pickup_capacity_full"
  | "unknown";

export interface AvailabilityCheckInput {
  productId: string;
  quantity: number;
  reservedFrom: string;
  reservedUntil: string;
}

export interface AvailabilityComponentResult {
  inventoryItemId: string;
  inventoryItemName: string;
  trackingType: "serialized" | "quantity" | "kit";

  requiredQuantity: number;
  availableQuantity: number;

  available: boolean;

  alternativeGroup?: string | null;
  requirementType?: string | null;

  availableUnitIds?: string[];
  missingQuantity?: number;
}

export interface AvailabilityResult {
  productId: string;
  productName: string;

  status: AvailabilityStatus;
  availableQuantity: number;

  reason: AvailabilityReason;

  missingComponents: AvailabilityComponentResult[];
  components: AvailabilityComponentResult[];

  warnings: string[];
}

export interface ProductForAvailability {
  id: string;
  name: string;
  active: boolean;
}

export interface InventoryItemForAvailability {
  id: string;
  name: string;
  tracking_type: "serialized" | "quantity" | "kit";
  total_quantity: number;
  quantity_on_hand?: number;
  quantity_available?: number;
  active: boolean;
}

export interface InventoryUnitForAvailability {
  id: string;
  inventory_item_id: string;
  unit_code: string;
  status: string;
}

export interface InventoryRecipeForAvailability {
  id: string;
  product_id: string;
  modifier_id: string | null;
  inventory_item_id: string;
  quantity_required: number;
  requirement_type: string;
  alternative_group: string | null;
  is_optional: boolean;
  inventory_behavior?: "reusable" | "consumable";
  inventory_items?: InventoryItemForAvailability;
}

export interface InventoryReservationForAvailability {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  inventory_item_id: string;
  inventory_unit_id: string | null;
  quantity: number;
  reserved_from: string;
  reserved_until: string;
  status: string;
  inventory_behavior?: "reusable" | "consumable";
}