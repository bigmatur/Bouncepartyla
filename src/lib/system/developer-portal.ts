export type SystemModuleState = "production" | "testing" | "development" | "planned";

export type SystemModule = {
  name: string;
  state: SystemModuleState;
  owner: string;
  sourceOfTruth: string;
  note: string;
};

export const SYSTEM_MODULES: SystemModule[] = [
  { name: "Booking", state: "production", owner: "Booking Engine", sourceOfTruth: "bookings + booking items", note: "Canonical creation/availability flow is shared by admin and customer booking." },
  { name: "Inventory", state: "production", owner: "Inventory Engine", sourceOfTruth: "inventory + reservations", note: "Serialized, quantity, kits, recipes and availability are operational core." },
  { name: "Route Board", state: "production", owner: "Route Board", sourceOfTruth: "route_stops", note: "Operational route state. Must not control payment/booking commit boundaries." },
  { name: "Working Time", state: "production", owner: "Working Time", sourceOfTruth: "staff_time_entries + staff_time_breaks", note: "Live RPC/table baseline confirmed against Supabase." },
  { name: "Payments / Stripe", state: "testing", owner: "Payment Engine", sourceOfTruth: "payments", note: "Live finalizer is decoupled from Route Board; customer Stripe flow still requires regression coverage." },
  { name: "Notifications", state: "development", owner: "Notification Engine", sourceOfTruth: "notification events/messages/deliveries/preferences", note: "Core, templates, delivery and scheduling exist; external providers require environment/config testing." },
  { name: "CRM", state: "development", owner: "CRM Conversation Layer", sourceOfTruth: "crm_conversations + crm_messages; existing booking_leads/tasks/customers", note: "Must not duplicate existing leads, tasks, customer or booking engines." },
  { name: "Communication Hub", state: "development", owner: "Channel Adapters", sourceOfTruth: "crm_messages", note: "Email/SMS adapters exist in repository; Instagram is not implemented yet." },
  { name: "Cleaning", state: "development", owner: "Inventory / Cleaning", sourceOfTruth: "cleaning tasks + inventory state", note: "Built on returned inventory and should remain connected to Inventory availability." },
  { name: "Instagram", state: "planned", owner: "Instagram Adapter", sourceOfTruth: "crm_messages", note: "Planned channel adapter for the existing CRM Inbox." },
];

export const LIVE_BASELINE = {
  stripeFinalizer: "finalize_booking_after_external_payment(uuid)",
  stripeExpiration: "expire_unpaid_customer_stripe_booking(uuid)",
  workingTimeRpcCount: 13,
  workingTimeTables: 6,
  paymentsStatusType: "text",
  verifiedAt: "2026-08-10",
};
