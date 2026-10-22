import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/132_booking_checklist_insert_only_initializer.sql",
);
const initializerPath = path.join(root, "src/lib/booking/checklist-initializer.ts");
const operationalEquipmentPath = path.join(
  root,
  "src/lib/booking/operational-equipment.ts",
);

const migration = fs.readFileSync(migrationPath, "utf8");
const initializer = fs.readFileSync(initializerPath, "utf8");
const operationalEquipment = fs.readFileSync(operationalEquipmentPath, "utf8");

const checks = [
  {
    name: "No invalid GET DIAGNOSTICS arithmetic",
    pass: !/get diagnostics\s+v_inserted\s*=\s*v_inserted\s*\+\s*row_count/i.test(migration),
  },
  {
    name: "Uses second row_count variable",
    pass: /v_inserted_second\s+integer/i.test(migration)
      && /get diagnostics\s+v_inserted_second\s*=\s*row_count/i.test(migration)
      && /v_inserted\s*:=\s*v_inserted\s*\+\s*v_inserted_second/i.test(migration),
  },
  {
    name: "No global booking status trigger",
    pass: !/create\s+trigger\s+trg_booking_confirmed_initialize_checklist_items/i.test(migration)
      && !/on_booking_confirmed_initialize_checklist_items/i.test(migration),
  },
  {
    name: "Internal/public function split exists",
    pass: /initialize_booking_checklist_items_insert_only_internal\s*\(/i.test(migration)
      && /create or replace function public\.initialize_booking_checklist_items_insert_only\s*\(/i.test(migration),
  },
  {
    name: "Public function restricted to authenticated booking creators",
    pass: /if\s+v_auth_role\s*<>\s*'authenticated'/i.test(migration)
      && /if\s+not\s+public\.current_user_can_create_bookings\(\)/i.test(migration),
  },
  {
    name: "Active reservation statuses include operational states",
    pass: /status,\s*''\)\s+in\s*\('reserved',\s*'picked',\s*'loaded',\s*'delivered',\s*'installed'\)/i.test(migration),
  },
  {
    name: "Reservation aggregation strategy present",
    pass: /reservation_groups\s+as\s*\(/i.test(migration)
      && /sum\(rr\.quantity\)\s+as\s+quantity/i.test(migration)
      && !/sum\(rr\.quantity\)::int\s+as\s+quantity/i.test(migration)
      && /group by[\s\S]*rr\.inventory_unit_id/i.test(migration),
  },
  {
    name: "Internal function execute grant is service_role only",
    pass: /grant execute on function public\.initialize_booking_checklist_items_insert_only_internal\(uuid\)\s*\n\s*to service_role;/i.test(migration),
  },
  {
    name: "TypeScript integration fails closed when RPC unavailable",
    pass: /checklistInitResult\.status === "unavailable"/.test(initializer)
      && /reason:\s*"rpc_unavailable"/.test(initializer),
  },
  {
    name: "TypeScript integration validates RPC success payload",
    pass: /\(payload as any\)\.success === true/.test(initializer)
      && /status:\s*payloadSuccess \? "ok" as const : "failed" as const/.test(operationalEquipment)
      && /checklistInitResult\.status === "failed"/.test(initializer)
      && /reason:\s*"rpc_unsuccessful_payload"/.test(initializer),
  },
];

const failed = checks.filter((c) => !c.pass);

for (const check of checks) {
  if (check.pass) {
    console.log(`PASS: ${check.name}`);
  } else {
    console.log(`FAIL: ${check.name}`);
  }
}

if (failed.length > 0) {
  console.error(`\n${failed.length} checks failed.`);
  process.exit(1);
}

console.log("\nAll Patch 1 migration checks passed.");
