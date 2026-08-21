-- Add business contact fields so payment receipts show legal/contact info.
alter table booking_receipt_design_settings
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists business_email text,
  add column if not exists business_website text;
