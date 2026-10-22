import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  process.cwd(),
  "src/lib/booking/checklist-initializer.ts",
);
const actionsPath = path.join(
  process.cwd(),
  "src/app/admin/bookings/new/actions.ts",
);

const source = fs.readFileSync(sourcePath, "utf8");
const actionsSource = fs.readFileSync(actionsPath, "utf8");

function has(pattern) {
  return pattern.test(source);
}

function test(name, predicate) {
  if (!predicate()) {
    throw new Error(`FAIL: ${name}`);
  }
  console.log(`PASS: ${name}`);
}

test("success path exists", () =>
  has(/reason:\s*"initialized"/) &&
  has(/\(payload as any\)\.success === true/),
);

test("missing RPC path exists", () =>
  has(/status === "unavailable"/) &&
  has(/reason:\s*"rpc_unavailable"/),
);

test("RPC exception path exists", () =>
  has(/catch \(error\)/) &&
  has(/reason:\s*"rpc_error"/),
);

test("unsuccessful payload path exists", () =>
  has(/reason:\s*"rpc_unsuccessful_payload"/) &&
  has(/Checklist initialization returned unsuccessful payload|Checklist initialization returned failed payload/),
);

test("RPC failed status is treated as unsuccessful payload", () =>
  has(/checklistInitResult\.status === "failed"/) &&
  has(/reason:\s*"rpc_unsuccessful_payload"/),
);

test("logs bookingId and context for diagnostics", () =>
  has(/bookingId/) && has(/context/),
);

test("recovery procedure text present", () =>
  has(/Re-run checklist initialization only for this booking/) &&
  has(/migration 132/i),
);

test("create flow keeps downstream operations after checklist init failure", () => {
  const checklistCallIndex = actionsSource.indexOf("runChecklistInitializationBestEffort(");

  assert.ok(checklistCallIndex > -1, "missing checklist init call in create flow");

  const downstreamSlice = actionsSource.slice(checklistCallIndex);

  assert.ok(
    /autoCreateRouteStopsForBooking\(\{/.test(downstreamSlice),
    "route stop creation must remain downstream",
  );

  assert.ok(
    /"booking_confirmed"/.test(downstreamSlice),
    "booking notifications path must remain downstream",
  );

  const checklistBlockStart = actionsSource.indexOf("if (!checklistInitResult.ok)", checklistCallIndex);
  const checklistBlockEnd = actionsSource.indexOf("\n  }\n\n  let staffCompletionUrl", checklistBlockStart);

  assert.ok(checklistBlockStart > -1 && checklistBlockEnd > checklistBlockStart, "missing checklist failure block");

  const checklistFailureBlock = actionsSource.slice(checklistBlockStart, checklistBlockEnd);
  assert.equal(/throw new Error\(/.test(checklistFailureBlock), false, "checklist failure block must not throw");

  return true;
});

test("reused booking exits before downstream operations", () => {
  const reusedGuardIndex = actionsSource.indexOf("persistedBooking.reusedExistingBooking");
  assert.ok(reusedGuardIndex > -1, "missing reusedExistingBooking guard");

  const reuseGuardWindow = actionsSource.slice(reusedGuardIndex, reusedGuardIndex + 1600);

  assert.ok(/return \{/.test(reuseGuardWindow), "reused booking API path must return early");
  assert.ok(/redirect\(/.test(reuseGuardWindow), "reused booking action path must redirect early");

  const downstreamOps = [
    "insertBookingItems({",
    "insertBookingModifiers({",
    "reserveProductComponentsInventory({",
    "reserveModifierInventory({",
    "autoCreateRouteStopsForBooking({",
    "createStripeCheckoutSession(",
    ".from(\"payments\")",
  ];

  for (const marker of downstreamOps) {
    assert.equal(
      reuseGuardWindow.includes(marker),
      false,
      `downstream operation must not run inside reused-booking guard: ${marker}`,
    );
  }

  return true;
});

console.log("All checklist initializer focused checks passed.");
