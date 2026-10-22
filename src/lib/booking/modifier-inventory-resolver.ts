export type ModifierInventorySelectionInput = {
  productId: string;
  productSelectionIndex: number;
  modifierGroupId: string;
  modifierGroupName: string;
  modifierOptionId: string;
  modifierOptionName: string;
  quantity: number;
  priceDelta: number;
};

export type ResolvedModifierInventorySelection = ModifierInventorySelectionInput & {
  inventoryItemId: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  inventoryBehavior: "reusable" | "consumable";
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function legacySelectionKey(params: {
  productId: string;
  groupId: string;
  optionId: string;
}) {
  return `${params.productId}::${params.groupId}::${params.optionId}`;
}

export async function resolveAuthoritativeModifierInventorySelections(params: {
  supabase: any;
  items: Array<{ productId: string }>;
  modifiers: ModifierInventorySelectionInput[];
  preserveLegacySelectionKeys?: Set<string>;
}) {
  const {
    supabase,
    items,
    modifiers,
    preserveLegacySelectionKeys = new Set<string>(),
  } = params;

  if (modifiers.length === 0) {
    return [] as ResolvedModifierInventorySelection[];
  }

  const productIds = Array.from(
    new Set(items.map((item) => cleanText(item.productId)).filter(Boolean)),
  );

  const optionIds = Array.from(
    new Set(
      modifiers
        .map((modifier) => cleanText(modifier.modifierOptionId))
        .filter(Boolean),
    ),
  );

  const [groupLinksResult, optionRowsResult] = await Promise.all([
    supabase
      .from("product_modifier_groups")
      .select(
        `
        product_id,
        modifier_group_id,
        active,
        modifier_groups (
          id,
          name,
          active
        )
      `,
      )
      .in("product_id", productIds),

    supabase
      .from("modifier_group_options")
      .select(
        "id, modifier_group_id, option_name, active, inventory_item_id, inventory_quantity, track_inventory, inventory_behavior",
      )
      .in("id", optionIds),
  ]);

  if (groupLinksResult.error) {
    throw new Error(groupLinksResult.error.message);
  }

  if (optionRowsResult.error) {
    throw new Error(optionRowsResult.error.message);
  }

  const allowedGroupIdsByProductId = new Map<string, Set<string>>();
  const groupNameByProductAndGroup = new Map<string, string>();

  for (const row of groupLinksResult.data || []) {
    const productId = cleanText((row as any).product_id);
    const groupId = cleanText((row as any).modifier_group_id);
    const group = Array.isArray((row as any).modifier_groups)
      ? (row as any).modifier_groups[0]
      : (row as any).modifier_groups;

    if (!productId || !groupId) {
      continue;
    }

    const productGroupActive = (row as any).active !== false;
    const groupActive = group?.active !== false;

    if (productGroupActive && groupActive) {
      const allowed = allowedGroupIdsByProductId.get(productId) || new Set<string>();
      allowed.add(groupId);
      allowedGroupIdsByProductId.set(productId, allowed);
    }

    const groupName = cleanText(group?.name);
    if (groupName) {
      groupNameByProductAndGroup.set(`${productId}::${groupId}`, groupName);
    }
  }

  const optionById = new Map<string, any>();

  for (const row of optionRowsResult.data || []) {
    const optionId = cleanText((row as any).id);
    if (!optionId) {
      continue;
    }
    optionById.set(optionId, row);
  }

  const resolved: ResolvedModifierInventorySelection[] = [];

  for (const modifier of modifiers) {
    const productId = cleanText(modifier.productId);
    const groupId = cleanText(modifier.modifierGroupId);
    const optionId = cleanText(modifier.modifierOptionId);

    if (!productId || !groupId || !optionId) {
      throw new Error("Invalid modifier selection payload.");
    }

    const option = optionById.get(optionId);

    if (!option) {
      throw new Error(`Selected modifier option is unavailable: ${optionId}`);
    }

    const optionGroupId = cleanText((option as any).modifier_group_id);

    if (!optionGroupId || optionGroupId !== groupId) {
      throw new Error("Modifier option does not belong to the selected modifier group.");
    }

    const allowedGroups = allowedGroupIdsByProductId.get(productId) || new Set<string>();
    const isAllowedActiveSelection = allowedGroups.has(groupId);
    const isOptionActive = (option as any).active !== false;

    const preserveLegacySelection = preserveLegacySelectionKeys.has(
      legacySelectionKey({ productId, groupId, optionId }),
    );

    if ((!isAllowedActiveSelection || !isOptionActive) && !preserveLegacySelection) {
      throw new Error("Modifier selection is no longer active for this product.");
    }

    const authoritativeInventoryItemId = cleanText((option as any).inventory_item_id) || null;
    const authoritativeInventoryQuantity = Math.max(
      0,
      Number((option as any).inventory_quantity ?? 1),
    );
    const authoritativeTrackInventory = (option as any).track_inventory !== false;
    const authoritativeInventoryBehavior =
      (option as any).inventory_behavior === "consumable" ? "consumable" : "reusable";

    const authoritativeGroupName =
      groupNameByProductAndGroup.get(`${productId}::${groupId}`) || modifier.modifierGroupName;
    const authoritativeOptionName = cleanText((option as any).option_name) || modifier.modifierOptionName;

    resolved.push({
      ...modifier,
      modifierGroupName: authoritativeGroupName,
      modifierOptionName: authoritativeOptionName,
      inventoryItemId: authoritativeInventoryItemId,
      inventoryQuantity: authoritativeInventoryQuantity,
      trackInventory: authoritativeTrackInventory,
      inventoryBehavior: authoritativeInventoryBehavior,
    });
  }

  return resolved;
}
