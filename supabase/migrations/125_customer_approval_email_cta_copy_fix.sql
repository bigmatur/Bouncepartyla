begin;

-- Keep existing event/template keys; only improve approved/rejected customer email content.
-- This migration is idempotent and safe to run repeatedly.

update public.notification_templates
set
  body_text = E'Hi {{customer_first_name}},\n\nYour booking request was approved. Complete your deposit payment by {{expires_at}} to secure your reservation.\n\nContinue to payment: {{action_url}}',
  body_html = E'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1b;">\n  <p>Hi {{customer_first_name}},</p>\n  <p>Your booking request was approved. Complete your deposit payment by <strong>{{expires_at}}</strong> to secure your reservation.</p>\n  <p><a href="{{action_url}}">Continue to payment</a></p>\n</div>',
  updated_at = now()
where event_code = 'customer_booking_approval_approved'
  and channel = 'email'
  and (
    coalesce(body_text, '') = ''
    or body_text = E'Hi {{customer_first_name}},\n\nYour booking request was approved. Complete your deposit payment by {{expires_at}} to secure your reservation.\n\nContinue: {{action_url}}'
    or body_text = 'Hi {{customer_first_name}}<br><br>Your booking request was approved. Complete your deposit payment by {{expires_at}} to secure your reservation.<br><br>Continue: {{action_url}}'
    or body_text like '%{{expires_at}}to secure your reservation.%'
  );

update public.notification_templates
set
  body_text = E'Hi {{customer_first_name}},\n\nUnfortunately, we\'re unable to accommodate delivery for your requested date and time.\n\nView booking: {{booking_url}}',
  body_html = E'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1b;">\n  <p>Hi {{customer_first_name}},</p>\n  <p>Unfortunately, we\'re unable to accommodate delivery for your requested date and time.</p>\n  <p><a href="{{booking_url}}">View booking</a></p>\n</div>',
  updated_at = now()
where event_code = 'customer_booking_approval_rejected'
  and channel = 'email'
  and (
    coalesce(body_text, '') = ''
    or body_text = E'Hi {{customer_first_name}},\n\nUnfortunately, we''re unable to accommodate delivery for your requested date and time.\n\nView booking: {{booking_url}}'
    or body_text = 'Hi {{customer_first_name}}<br><br>Unfortunately, we''re unable to accommodate delivery for your requested date and time.<br><br>View booking: {{booking_url}}'
  );

notify pgrst, 'reload schema';

commit;
