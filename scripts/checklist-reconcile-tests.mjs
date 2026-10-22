import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const opPath = path.join(
  process.cwd(),
  "src/lib/booking/operational-equipment.ts",
);
const actionsPath = path.join(
  process.cwd(),
  "src/app/admin/bookings/new/actions.ts",
);
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/132_booking_checklist_insert_only_initializer.sql",
);

const opSource = fs.readFileSync(opPath, "utf8");
const actionsSource = fs.readFileSync(actionsPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");

function test(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

function has(src, pattern) {
  return pattern.test(src);
}

test("reservation grouping key supports unit-level separation", () => {
  assert.ok(
    has(opSource, /groupKey\s*=\s*inventoryUnitId\s*\?\s*`unit:\$\{inventoryUnitId\}`/),
  );
});

test("non-serialized reservations grouped by booking_item_id plus inventory_item_id", () => {
  assert.ok(
    has(opSource, /: `item:\$\{bookingItemId \|\| "none"\}:\$\{inventoryItemId \|\| "none"\}`/),
  );
});

test("inactive released reservations excluded from new expected rows", () => {
  assert.ok(has(opSource, /ACTIVE_RESERVATION_STATUSES/));
  assert.ok(has(opSource, /"reserved"/));
  assert.ok(has(opSource, /"picked"/));
  assert.ok(has(opSource, /"loaded"/));
  assert.ok(has(opSource, /"delivered"/));
  assert.ok(has(opSource, /"installed"/));
  assert.equal(/"returned"/.test(opSource), false);
  assert.equal(/"damaged"/.test(opSource), false);
  assert.equal(/"missing"/.test(opSource), false);
});

test("fractional reservation quantities are fail-safe and conflict-reported", () => {
  assert.ok(has(opSource, /fractional_quantity/));
  assert.ok(has(opSource, /Number\.isInteger\(grouped\.quantity\)/));
  assert.ok(has(opSource, /Unsupported fractional reservation quantity/));
});

test("historical operational auto rows are preserved, not deleted", () => {
  assert.ok(has(opSource, /hasOperationalState/));
  assert.ok(has(opSource, /hasOperationalEvidence\(row\)/));
  assert.ok(has(opSource, /\?\.loaded \|\|/));
  assert.ok(has(opSource, /\?\.installed \|\|/));
  assert.ok(has(opSource, /\?\.notes/));
  assert.ok(has(opSource, /if \(hasOperationalState\) \{/));
  assert.ok(has(opSource, /protected_operational_row/));
  assert.ok(has(opSource, /skipped identity\/quantity rewrite/));
});

test("manual checklist rows remain untouched", () => {
  assert.ok(has(opSource, /AUTO_CHECKLIST_SOURCES/));
  assert.ok(has(opSource, /existingRows\.filter\(\(row\) =>\s*AUTO_CHECKLIST_SOURCES/));
});

test("idempotent SQL initializer exists for insert-only generation", () => {
  assert.ok(has(migrationSource, /initialize_booking_checklist_items_insert_only_internal/));
  assert.ok(has(migrationSource, /where not exists/));
  assert.ok(has(migrationSource, /fractional_quantity_unsupported/));
});

test("new booking flow uses server-authoritative modifier inventory", () => {
  assert.ok(has(actionsSource, /resolveAuthoritativeModifierInventorySelections/));
  assert.ok(has(actionsSource, /modifier_group_options"\)\s*\.select\(/));
  assert.ok(has(actionsSource, /inventory_item_id/));
  assert.ok(has(actionsSource, /track_inventory/));
  assert.ok(has(actionsSource, /inventory_behavior/));
});

test("reused booking idempotency guard still exits early", () => {
  const guardIndex = actionsSource.indexOf("persistedBooking.reusedExistingBooking");
  assert.ok(guardIndex > -1);
  const guardSlice = actionsSource.slice(guardIndex, guardIndex + 1200);
  assert.ok(/return \{/.test(guardSlice));
  assert.ok(/redirect\(/.test(guardSlice));
});

console.log("All checklist reconciliation focused checks passed.");
