import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/133_driver_payment_not_collected_exception.sql",
);
const apiRoutePath = path.join(
  process.cwd(),
  "src/app/api/mobile/driver/payments/not-collected/route.ts",
);
const mobileApiPath = path.join(
  process.cwd(),
  "apps/staff-mobile/src/lib/mobileApi.ts",
);
const driverRoutesPath = path.join(
  process.cwd(),
  "apps/staff-mobile/src/features/routes/driverRoutes.ts",
);
const homeScreenPath = path.join(
  process.cwd(),
  "apps/staff-mobile/src/screens/HomeScreen.tsx",
);

const migrationSource = fs.readFileSync(migrationPath, "utf8");
const apiRouteSource = fs.readFileSync(apiRoutePath, "utf8");
const mobileApiSource = fs.readFileSync(mobileApiPath, "utf8");
const driverRoutesSource = fs.readFileSync(driverRoutesPath, "utf8");
const homeScreenSource = fs.readFileSync(homeScreenPath, "utf8");
const notificationEnginePath = path.join(
  process.cwd(),
  "src/lib/notifications/engine.ts",
);
const notificationEngineSource = fs.readFileSync(notificationEnginePath, "utf8");

function test(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

function has(src, pattern) {
  return pattern.test(src);
}

test("migration defines route_stop_payment_exceptions table and unique stop constraint", () => {
  assert.ok(has(migrationSource, /create table if not exists public\.route_stop_payment_exceptions/i));
  assert.ok(has(migrationSource, /create unique index if not exists uq_route_stop_payment_exceptions_active_stop_booking/i));
  assert.ok(has(migrationSource, /on public\.route_stop_payment_exceptions\(route_stop_id, booking_id\)/i));
  assert.ok(has(migrationSource, /where is_active = true/i));
});

test("migration defines report_my_route_stop_payment_not_collected RPC with required reason validation", () => {
  assert.ok(has(migrationSource, /create or replace function public\.report_my_route_stop_payment_not_collected/i));
  assert.ok(has(migrationSource, /v_reason not in\s*\(/i));
  assert.ok(has(migrationSource, /if v_reason = 'other' and v_comment is null then/i));
  assert.ok(has(migrationSource, /\('cancelled', 'failed', 'installed', 'picked_up', 'completed'\)/i));
});

test("migration completion gate allows active payment exception and keeps booking as source of truth", () => {
  assert.ok(has(migrationSource, /create or replace function public\.update_my_route_stop_status/i));
  assert.ok(has(migrationSource, /select greatest\(coalesce\(b\.balance_due, 0\), 0\)/i));
  assert.ok(has(migrationSource, /from public\.route_stop_payment_exceptions ex/i));
  assert.ok(has(migrationSource, /ex\.booking_id is not distinct from v_stop\.booking_id/i));
  assert.ok(has(migrationSource, /Collect payment before completing this stop, or report Payment Not Collected with a reason\./i));
  assert.ok(has(migrationSource, /and not coalesce\(v_stop\.payment_collected, false\)/i));
});

test("migration keeps original report on repeated and concurrent submissions", () => {
  assert.ok(has(migrationSource, /select ex\.\*\s+into v_existing_exception[\s\S]*for update;/i));
  assert.ok(has(migrationSource, /on conflict \(route_stop_id, booking_id\)[\s\S]*do nothing;/i));
  assert.ok(has(migrationSource, /get diagnostics v_inserted_count = row_count;/i));
  assert.ok(has(migrationSource, /'already_reported', \(v_inserted_count = 0\)/i));
  assert.equal(has(migrationSource, /on conflict \(route_stop_id\) do update/i), false);
});

test("migration RLS select policy uses stable identity and not driver-name matching", () => {
  assert.ok(has(migrationSource, /route_stop_payment_exceptions\.auth_user_id = auth\.uid\(\)/i));
  assert.ok(has(migrationSource, /route_stop_payment_exceptions\.route_driver_id/i));
  assert.equal(has(migrationSource, /rs\.driver_name = public\.current_route_driver_name\(\)/i), false);
});

test("migration 133 extends enqueue_staff_booking_notification personalization for payment_not_collected", () => {
  assert.ok(has(migrationSource, /create or replace function public\.enqueue_staff_booking_notification/i));
  assert.ok(has(migrationSource, /'booking_created',[\s\S]*'customer_booking_approval_requested',[\s\S]*'payment_received',[\s\S]*'payment_not_collected'/i));
  assert.ok(has(migrationSource, /v_role = 'admin'[\s\S]*'super_admin'/i));
  assert.ok(has(migrationSource, /on conflict \(dedupe_key\) where dedupe_key is not null do nothing/i));
});

test("API route validates reason and comment and calls payment-not-collected RPC", () => {
  assert.ok(has(apiRouteSource, /parseReason\(/));
  assert.ok(has(apiRouteSource, /Comment is required when reason is Other\./));
  assert.ok(has(apiRouteSource, /report_my_route_stop_payment_not_collected/));
  assert.ok(has(apiRouteSource, /"installed"\s*\|\|\s*value === "picked_up"\s*\|\|\s*value === "completed"/));
});

test("API route uses authoritative booking balance and does not mutate booking financials", () => {
  assert.ok(has(apiRouteSource, /\.from\("bookings"\)\s*\.select\("id, booking_number, status, balance_due"\)/));
  assert.equal(has(apiRouteSource, /\.from\("bookings"\)\s*\.update\(/), false);
  assert.equal(has(apiRouteSource, /payment_transactions|payments\.create|amount_paid|balance_due\s*=|booking_payments/i), false);
});

test("API route enqueues payment_not_collected notifications and processes queue best effort", () => {
  assert.ok(has(apiRouteSource, /eventCode:\s*"payment_not_collected"/));
  assert.ok(has(apiRouteSource, /recipientRole:\s*"admin"/));
  assert.ok(has(apiRouteSource, /recipientRole:\s*"manager"/));
  assert.ok(has(apiRouteSource, /processNotificationQueueBestEffort\(/));
  assert.ok(has(apiRouteSource, /if \(reportStatus !== "no_balance_due"\)/));
  assert.ok(has(apiRouteSource, /dedupeSuffix:\s*`driver-\$\{stopId\}`/));
});

test("API route returns report status from RPC and original reason/comment on duplicate", () => {
  assert.ok(has(apiRouteSource, /const reasonCode = parseReason\(reportData\?\.reason_code\) \|\| reason;/));
  assert.ok(has(apiRouteSource, /const persistedCommentRaw = reportData\?\.reason_comment;/));
  assert.ok(has(apiRouteSource, /typeof persistedCommentRaw === "string"/));
  assert.ok(has(apiRouteSource, /const reportStatusRaw = String\(\s*reportData\?\.report_status/i));
  assert.ok(has(apiRouteSource, /const stopType = stopTypeLabel\(\s*reportData\?\.stop_type \?\? stop\.stop_type/i));
  assert.ok(has(apiRouteSource, /const driverName = String\(\s*reportData\?\.driver_name \|\| stop\.driver_name/i));
});

test("API route retries enqueue on duplicates while relying on dedupe and logs failures", () => {
  assert.equal(has(apiRouteSource, /if \(!alreadyReported\)/), false);
  assert.ok(has(apiRouteSource, /alreadyReported\s*=\s*Boolean\(reportData\?\.already_reported\)\s*\|\|\s*reportStatus\s*===\s*"already_reported"/));
  assert.ok(has(apiRouteSource, /console\.error\("Driver payment-not-collected notification enqueue failed"/));
  assert.ok(has(apiRouteSource, /reportStatus,/));
  assert.ok(has(apiRouteSource, /alreadyReported,/));
});

test("API route does not enqueue notifications for no_balance_due", () => {
  assert.ok(has(apiRouteSource, /if \(authoritativeBalance <= 0\)[\s\S]*reportStatus:\s*"no_balance_due"/));
  assert.ok(has(apiRouteSource, /if \(reportStatus !== "no_balance_due"\)/));
});

test("mobile API exposes reportDriverPaymentNotCollectedFromMobile", () => {
  assert.ok(has(mobileApiSource, /export type MobileDriverPaymentNotCollectedReason/));
  assert.ok(has(mobileApiSource, /export async function reportDriverPaymentNotCollectedFromMobile/));
  assert.ok(has(mobileApiSource, /"\/api\/mobile\/driver\/payments\/not-collected"/));
});

test("driver route loader includes authoritative booking balance and payment exception fields", () => {
  assert.ok(has(driverRoutesSource, /booking_balance_due\?: number \| string \| null/));
  assert.ok(has(driverRoutesSource, /payment_not_collected_reported\?: boolean \| null/));
  assert.ok(has(driverRoutesSource, /bookings\s*\([\s\S]*balance_due[\s\S]*\)/));
  assert.ok(has(driverRoutesSource, /route_stop_payment_exceptions/));
});

test("HomeScreen allows completion when payment exception exists and exposes reporting UI", () => {
  assert.ok(has(homeScreenSource, /reportDriverPaymentNotCollectedFromMobile/));
  assert.ok(has(homeScreenSource, /activeStop\?\.booking_balance_due \?\?/));
  assert.ok(has(homeScreenSource, /activePaymentExceptionReported/));
  assert.ok(has(homeScreenSource, /activePaymentRequired &&\s*!activePaymentExceptionReported/));
  assert.ok(has(homeScreenSource, /Payment Not Collected/));
  assert.ok(has(homeScreenSource, /confirmPaymentNotCollected/));
});

test("notification renderer supports payment-not-collected template variables", () => {
  assert.ok(has(notificationEngineSource, /function render\(/));
  assert.ok(has(notificationEngineSource, /action_url:\s*String\(payload\.action_url/i));
  assert.ok(has(notificationEngineSource, /const vars: Record<string, string> = \{/));
  assert.ok(has(notificationEngineSource, /balance_due:\s*money\(booking\?\.balance_due\)/));
});

test("notification renderer has no payment receipt branch for payment_not_collected", () => {
  assert.equal(
    has(notificationEngineSource, /delivery\.event_code === "payment_not_collected"[\s\S]*buildPaymentReceiptPdfBuffer/),
    false,
  );
});

test("HomeScreen completion gate is consistent with server: payment collected or exception can unblock", () => {
  assert.ok(has(homeScreenSource, /activePaymentRequired[\s\S]*!Boolean\([\s\S]*activeStop\?\.payment_collected/));
  assert.ok(has(homeScreenSource, /activePaymentRequired &&\s*!activePaymentExceptionReported/));
});

console.log("All payment-not-collected focused checks passed.");
