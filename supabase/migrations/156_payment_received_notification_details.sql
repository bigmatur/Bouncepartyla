-- 156_payment_received_notification_details.sql
-- Show the amount and payment method in all newly rendered in-app payment alerts.

begin;

update public.notification_templates
set
  body_text = 'Payment received for {{booking_number}}. Amount: {{payment_amount}} · Method: {{payment_method}}',
  updated_at = now()
where event_code = 'payment_received'
  and channel = 'in_app'
  and (
    body_text is null
    or btrim(body_text) = ''
    or body_text in (
      'Payment received for {{booking_number}}.',
      'Payment received for {{booking_number}}'
    )
  );

commit;
