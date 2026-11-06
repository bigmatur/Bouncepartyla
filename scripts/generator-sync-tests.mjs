import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const resolverPath = path.join(
  process.cwd(),
  "src/lib/booking/modifier-inventory-resolver.ts",
);
const editActionsPath = path.join(
  process.cwd(),
  "src/app/admin/bookings/[id]/actions.ts",
);
const createActionsPath = path.join(
  process.cwd(),
  "src/app/admin/bookings/new/actions.ts",
);

const resolverSource = fs.readFileSync(resolverPath, "utf8");
const editActionsSource = fs.readFileSync(editActionsPath, "utf8");
const createActionsSource = fs.readFileSync(createActionsPath, "utf8");

function test(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

function has(src, pattern) {
  return pattern.test(src);
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    return "";
  }

  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    return source.slice(start);
  }

  return source.slice(start, end);
}

const createInsertSection = between(
  createActionsSource,
  "async function insertBookingModifiers",
  "async function reserveModifierInventory",
);

const editInsertSection = between(
  editActionsSource,
  "async function insertBookingModifiersWithFallback",
  "export async function updateBookingDiscountAction",
);

test("shared resolver exists and normalizes authoritative inventory fields", () => {
  assert.ok(has(resolverSource, /resolveAuthoritativeModifierInventorySelections/));
  assert.ok(has(resolverSource, /inventory_item_id/));
  assert.ok(has(resolverSource, /inventory_quantity/));
  assert.ok(has(resolverSource, /track_inventory/));
  assert.ok(has(resolverSource, /inventory_behavior/));
});

test("shared resolver supports legacy-safe preserved selections", () => {
  assert.ok(has(resolverSource, /preserveLegacySelectionKeys\?: Set<string>/));
  assert.ok(has(resolverSource, /legacySelectionKey\(/));
  assert.ok(has(resolverSource, /isOptionActive/));
  assert.ok(has(resolverSource, /isAllowedActiveSelection/));
  assert.ok(has(resolverSource, /preserveLegacySelection/));
});

test("new booking flow imports shared resolver", () => {
  assert.ok(has(createActionsSource, /from "@\/lib\/booking\/modifier-inventory-resolver"/));
  assert.ok(has(createActionsSource, /resolveAuthoritativeModifierInventorySelections\(/));
});

test("edit booking flow imports shared resolver", () => {
  assert.ok(has(editActionsSource, /from "@\/lib\/booking\/modifier-inventory-resolver"/));
  assert.ok(has(editActionsSource, /resolveAuthoritativeModifierInventorySelections\(/));
});

test("edit booking flow builds legacySelectionKeys from existing booking_modifiers", () => {
  assert.ok(has(editActionsSource, /existingModifierRowsResult/));
  assert.ok(has(editActionsSource, /from\("booking_modifiers"\)/));
  assert.ok(has(editActionsSource, /legacySelectionKeys\.add\(/));
  assert.ok(has(editActionsSource, /preserveLegacySelectionKeys:\s*legacySelectionKeys/));
});

test("edit flow performs modifier_id preflight before destructive deletes", () => {
  const preflightIndex = editActionsSource.indexOf(
    "const preflightLegacyModifierIdByOptionId = await resolveLegacyModifierIdsForOptions",
  );
  const deleteModifiersIndex = editActionsSource.indexOf(
    'const deleteModifiersResult = await supabase\n    .from("booking_modifiers")\n    .delete()',
  );
  const deleteItemsIndex = editActionsSource.indexOf(
    'const deleteItemsResult = await supabase\n    .from("booking_items")\n    .delete()',
  );

  assert.ok(preflightIndex > -1);
  assert.ok(deleteModifiersIndex > -1);
  assert.ok(deleteItemsIndex > -1);
  assert.ok(preflightIndex < deleteModifiersIndex);
  assert.ok(preflightIndex < deleteItemsIndex);
});

test("edit flow reuses preflight modifier_id map for insert", () => {
  assert.ok(
    has(
      editActionsSource,
      /insertBookingModifiersWithFallback\([\s\S]*preResolvedLegacyModifierIdByOptionId:\s*preflightLegacyModifierIdByOptionId/,
    ),
  );
});

test("insert helper fails on unresolved modifier_id before insert", () => {
  assert.ok(
    has(
      editActionsSource,
      /function buildStrictRows\([\s\S]*Failed to resolve modifier_id for options/,
    ),
  );
});

test("preflight modifier_group_options query uses confirmed columns only", () => {
  assert.ok(
    has(
      editActionsSource,
      /\.from\("modifier_group_options"\)\s*\.select\("id, modifier_id, option_name"\)/,
    ),
  );
  assert.ok(
    has(
      editActionsSource,
      /\.from\("modifier_group_options"\)\s*\.select\("id, option_name"\)/,
    ),
  );
});

test("preflight helper does not rely on modifier_group_options name or label", () => {
  const preflightSection = between(
    editActionsSource,
    "async function resolveLegacyModifierIdsForOptions",
    "async function insertBookingModifiersWithFallback",
  );

  assert.equal(has(preflightSection, /\?\.name/), false);
  assert.equal(has(preflightSection, /\?\.label/), false);
  assert.equal(has(preflightSection, /,\s*name,/), false);
  assert.equal(has(preflightSection, /,\s*label/), false);
});

test("edit booking flow uses resolvedModifiers for booking_modifiers insert", () => {
  assert.ok(has(editActionsSource, /insertBookingModifiersWithFallback\([\s\S]*modifiers:\s*resolvedModifiers/));
});

test("edit booking flow uses resolvedModifiers for reservation rebuild", () => {
  assert.ok(has(editActionsSource, /rebuildInventoryReservationsForBookingEdit\([\s\S]*modifiers:\s*resolvedModifiers\.map/));
});

test("edit booking flow uses resolvedModifiers for pricing subtotal", () => {
  assert.ok(has(editActionsSource, /const modifiersSubtotal = Number\([\s\S]*resolvedModifiers/));
});

test("create modifiers fallback never substitutes optionId as modifier_id", () => {
  assert.equal(
    has(
      createInsertSection,
      /modifier_id:\s*item\.optionId/,
    ),
    false,
  );
  assert.ok(
    has(
      createActionsSource,
      /Failed to resolve modifier_id for options/,
    ),
  );
});

test("edit modifiers fallback never substitutes optionId as modifier_id", () => {
  assert.equal(
    has(
      editInsertSection,
      /modifier_id:\s*item\.optionId/,
    ),
    false,
  );
  assert.ok(
    has(
      editActionsSource,
      /Failed to resolve modifier_id for options/,
    ),
  );
});

test("legacy variant inserts with label or line_total are removed", () => {
  assert.equal(
    has(createInsertSection, /insertWithNewSchemaVariants/),
    false,
  );
  assert.equal(
    has(editInsertSection, /insertWithNewSchemaVariants/),
    false,
  );
  assert.equal(
    has(createInsertSection, /\bline_total\s*:/),
    false,
  );
  assert.equal(
    has(editInsertSection, /\bline_total\s*:/),
    false,
  );
  assert.equal(
    has(createInsertSection, /\blabel\s*:/),
    false,
  );
  assert.equal(
    has(editInsertSection, /\blabel\s*:/),
    false,
  );
});

console.log("All generator sync focused checks passed.");
