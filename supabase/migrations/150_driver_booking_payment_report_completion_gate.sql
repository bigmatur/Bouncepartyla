-- Production migration: Staff Mobile Payment Reporting Variant A
-- Purpose:
-- 1) Keep route-stop completion authorization and safety checks intact.
-- 2) Allow Pickup completion when the same booking has a valid Delivery payment report
--    covering current bookings.balance_due, even if admin reconciliation is pending.
-- 3) Keep financial ledger/bookings untouched (operational marker only).

BEGIN;

CREATE TABLE IF NOT EXISTS public.route_booking_payment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  report_scope text NOT NULL DEFAULT 'booking_balance_due',
  amount_due_at_report numeric NOT NULL CHECK (amount_due_at_report >= 0),
  amount_reported numeric NOT NULL CHECK (amount_reported >= 0),
  reported_by_driver_name text,
  source_route_stop_id uuid REFERENCES public.route_stops(id) ON DELETE SET NULL,
  payment_method text,
  report_state text NOT NULL DEFAULT 'reported' CHECK (
    report_state IN ('reported', 'confirmed_complete', 'superseded', 'voided', 'requires_review')
  ),
  reconciliation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_booking_payment_reports_booking
  ON public.route_booking_payment_reports(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_route_booking_payment_reports_state
  ON public.route_booking_payment_reports(report_state, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_booking_payment_reports_active_booking
  ON public.route_booking_payment_reports(booking_id)
  WHERE report_state IN ('reported', 'confirmed_complete', 'requires_review');


CREATE OR REPLACE FUNCTION public.mark_my_route_stop_payment_collected(
  p_stop_id uuid,
  p_amount numeric,
  p_method text default 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stop public.route_stops%rowtype;
  v_user_id uuid := auth.uid();
  v_driver_name text;
  v_amount numeric;
  v_method text;
  v_amount_due_at_report numeric := 0;
  v_existing_report_amount numeric := 0;
  v_existing_report_state text;
  v_existing_report_method text;
  v_existing_reported_by text;
  v_existing_reported_at timestamptz;
  v_existing_report_source_stop_id uuid;
  v_has_existing_report boolean := false;
  v_report_source_stop_id uuid;
  v_existing_source_stop_type text;
  v_new_total_reported numeric := 0;
  v_report_state text;
BEGIN
  v_stop := public.get_my_assigned_route_stop(p_stop_id);
  IF v_stop.id IS NULL OR v_stop.booking_id IS NULL THEN
    RAISE EXCEPTION 'Assigned booking stop was not found';
  END IF;

  PERFORM 1 FROM public.bookings WHERE id = v_stop.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT rs.*
    INTO v_stop
  FROM public.route_stops rs
  WHERE rs.id = v_stop.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assigned booking stop was not found';
  END IF;

  v_amount := greatest(coalesce(p_amount, 0), 0);
  v_method := lower(trim(coalesce(p_method, 'cash')));
  IF v_method = '' THEN
    v_method := 'cash';
  END IF;

  SELECT
    r.amount_reported,
    r.report_state,
    r.payment_method,
    r.reported_by_driver_name,
    r.created_at,
    r.source_route_stop_id
  INTO
    v_existing_report_amount,
    v_existing_report_state,
    v_existing_report_method,
    v_existing_reported_by,
    v_existing_reported_at,
    v_existing_report_source_stop_id
  FROM public.route_booking_payment_reports r
  WHERE r.booking_id = v_stop.booking_id
    AND r.report_state IN ('reported', 'confirmed_complete', 'requires_review')
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;

  v_has_existing_report := FOUND;

  IF NOT v_has_existing_report
     AND EXISTS (
       SELECT 1
       FROM public.route_booking_payment_reports r
       WHERE r.booking_id = v_stop.booking_id
         AND r.report_state = 'voided'
     )
  THEN
    RAISE EXCEPTION 'Payment report was voided. Administrator reconciliation is required.';
  END IF;

  IF coalesce(v_stop.payment_collected, false) THEN
    IF coalesce(v_stop.payment_collected_amount, 0) = v_amount
       AND lower(coalesce(v_stop.payment_collected_method, 'cash')) = v_method
    THEN
      IF v_has_existing_report THEN
        RETURN jsonb_build_object(
          'id', v_stop.id,
          'payment_collected', true,
          'payment_collected_amount', v_stop.payment_collected_amount,
          'payment_collected_method', v_stop.payment_collected_method,
          'payment_collected_by', v_stop.payment_collected_by,
          'payment_collected_at', v_stop.payment_collected_at,
          'booking_payment_reported_amount', v_existing_report_amount,
          'updated_at', v_stop.updated_at,
          'already_reported', true
        );
      END IF;

      RETURN jsonb_build_object(
        'id', v_stop.id,
        'payment_collected', true,
        'payment_collected_amount', v_stop.payment_collected_amount,
        'payment_collected_method', v_stop.payment_collected_method,
        'payment_collected_by', v_stop.payment_collected_by,
        'payment_collected_at', v_stop.payment_collected_at,
        'updated_at', v_stop.updated_at,
        'already_reported', true
      );
    END IF;

    RAISE EXCEPTION 'Payment was already reported for this stop. Use another assigned stop for additional collection or ask administrator reconciliation.';
  END IF;

  SELECT greatest(coalesce(b.balance_due, 0), 0)
    INTO v_amount_due_at_report
  FROM public.bookings b
  WHERE b.id = v_stop.booking_id;

  IF v_has_existing_report
     AND coalesce(v_existing_report_amount, 0) >= v_amount_due_at_report
     AND coalesce(v_existing_report_state, '') IN ('reported', 'confirmed_complete', 'requires_review')
  THEN
    RETURN jsonb_build_object(
      'id', v_stop.id,
      'payment_collected', coalesce(v_stop.payment_collected, false),
      'payment_collected_amount', coalesce(v_stop.payment_collected_amount, 0),
      'payment_collected_method', v_stop.payment_collected_method,
      'payment_collected_by', v_stop.payment_collected_by,
      'payment_collected_at', v_stop.payment_collected_at,
      'booking_payment_reported_amount', v_existing_report_amount,
      'updated_at', v_stop.updated_at,
      'already_reported', true
    );
  END IF;

  v_report_source_stop_id := v_stop.id;

  IF v_has_existing_report AND v_existing_report_source_stop_id IS NOT NULL THEN
    SELECT lower(coalesce(rs.stop_type::text, ''))
      INTO v_existing_source_stop_type
    FROM public.route_stops rs
    WHERE rs.id = v_existing_report_source_stop_id;

    IF v_existing_source_stop_type = 'delivery' THEN
      v_report_source_stop_id := v_existing_report_source_stop_id;
    END IF;
  END IF;

  IF lower(coalesce(v_stop.stop_type::text, '')) = 'delivery' THEN
    v_report_source_stop_id := v_stop.id;
  END IF;

  SELECT rd.name INTO v_driver_name
  FROM public.route_drivers rd
  WHERE rd.auth_user_id = v_user_id
    AND coalesce(rd.active, true) = true
    AND rd.deleted_at IS NULL
  ORDER BY rd.sort_order ASC NULLS LAST, rd.created_at ASC NULLS LAST, rd.id
  LIMIT 1;

  UPDATE public.route_stops
  SET payment_collected = true,
      payment_collected_amount = v_amount,
      payment_collected_method = v_method,
      payment_collected_by = coalesce(v_driver_name, v_stop.driver_name),
      payment_collected_at = now(),
      updated_at = now()
  WHERE id = v_stop.id
  RETURNING * INTO v_stop;

  v_new_total_reported := coalesce(v_existing_report_amount, 0) + v_amount;

  v_report_state := CASE
    WHEN v_new_total_reported >= v_amount_due_at_report THEN 'reported'
    ELSE 'requires_review'
  END;

  UPDATE public.route_booking_payment_reports r
     SET report_state = 'superseded',
         updated_at = now()
   WHERE r.booking_id = v_stop.booking_id
     AND r.report_state IN ('reported', 'confirmed_complete', 'requires_review');

  INSERT INTO public.route_booking_payment_reports (
    booking_id,
    report_scope,
    amount_due_at_report,
    amount_reported,
    reported_by_driver_name,
    source_route_stop_id,
    payment_method,
    report_state,
    created_at,
    updated_at
  )
  VALUES (
    v_stop.booking_id,
    'booking_balance_due',
    v_amount_due_at_report,
    v_new_total_reported,
    coalesce(v_driver_name, v_stop.driver_name),
    v_report_source_stop_id,
    v_method,
    v_report_state,
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'id', v_stop.id,
    'payment_collected', v_stop.payment_collected,
    'payment_collected_amount', v_stop.payment_collected_amount,
    'payment_collected_method', v_stop.payment_collected_method,
    'payment_collected_by', v_stop.payment_collected_by,
    'payment_collected_at', v_stop.payment_collected_at,
    'booking_payment_reported_amount', v_new_total_reported,
    'updated_at', v_stop.updated_at,
    'already_reported', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_driver_booking_payment_reports(
  p_booking_ids uuid[]
)
RETURNS TABLE(
  booking_id uuid,
  payment_reported boolean,
  payment_report_needs_review boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_name text;
  v_requested_count integer := coalesce(array_length(p_booking_ids, 1), 0);
  v_accessible_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF coalesce(array_length(p_booking_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Too many bookings requested';
  END IF;

  SELECT rd.name INTO v_driver_name
  FROM public.route_drivers rd
  WHERE rd.auth_user_id = auth.uid()
    AND coalesce(rd.active, true) = true
    AND rd.deleted_at IS NULL
  ORDER BY rd.sort_order ASC NULLS LAST, rd.created_at ASC NULLS LAST, rd.id
  LIMIT 1;

  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Active driver not found';
  END IF;

  WITH requested AS (
    SELECT DISTINCT id
    FROM unnest(coalesce(p_booking_ids, ARRAY[]::uuid[])) AS ids(id)
    WHERE id IS NOT NULL
  )
  SELECT count(*)
    INTO v_accessible_count
  FROM requested r
  WHERE EXISTS (
    SELECT 1
    FROM public.route_stops assigned
    WHERE assigned.booking_id = r.id
      AND assigned.driver_name = v_driver_name
      AND assigned.stop_type IN ('delivery', 'pickup')
      AND coalesce(assigned.status::text, '') <> 'cancelled'
  );

  IF v_requested_count > 0 AND v_accessible_count <> (
    SELECT count(*)
    FROM (
      SELECT DISTINCT id
      FROM unnest(coalesce(p_booking_ids, ARRAY[]::uuid[])) AS ids(id)
      WHERE id IS NOT NULL
    ) q
  ) THEN
    RAISE EXCEPTION 'Booking is not assigned to this driver';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT DISTINCT id AS booking_id
    FROM unnest(coalesce(p_booking_ids, ARRAY[]::uuid[])) AS ids(id)
    WHERE id IS NOT NULL
  ), booking_due AS (
    SELECT r.booking_id, greatest(coalesce(b.balance_due, 0), 0) AS balance_due
    FROM requested r
    JOIN public.bookings b ON b.id = r.booking_id
  ), latest_report AS (
    SELECT
      bd.booking_id,
      bd.balance_due,
      lr.id AS report_id,
      lr.report_state,
      lr.amount_reported,
      rs.stop_type AS source_stop_type,
      rs.status AS source_stop_status
    FROM booking_due bd
    LEFT JOIN LATERAL (
      SELECT r.*
      FROM public.route_booking_payment_reports r
      WHERE r.booking_id = bd.booking_id
      ORDER BY
        r.created_at DESC,
        CASE WHEN r.report_state = 'superseded' THEN 1 ELSE 0 END,
        r.id DESC
      LIMIT 1
    ) lr ON true
    LEFT JOIN public.route_stops rs
      ON rs.id = lr.source_route_stop_id
  ), fallback_delivery AS (
    SELECT
      bd.booking_id,
      EXISTS (
        SELECT 1
        FROM public.route_stops d
        WHERE d.booking_id = bd.booking_id
          AND lower(coalesce(d.stop_type::text, '')) = 'delivery'
          AND lower(coalesce(d.status::text, '')) IN ('installed', 'completed')
          AND coalesce(d.payment_collected, false) = true
          AND coalesce(d.payment_collected_amount, 0) >= bd.balance_due
      ) AS has_valid_fallback,
      EXISTS (
        SELECT 1
        FROM public.route_stops d
        WHERE d.booking_id = bd.booking_id
          AND lower(coalesce(d.stop_type::text, '')) = 'delivery'
          AND lower(coalesce(d.status::text, '')) IN ('installed', 'completed')
          AND coalesce(d.payment_collected, false) = true
      ) AS has_any_fallback
    FROM booking_due bd
  )
  SELECT
    lr.booking_id,
    (
      (
        lr.report_id IS NOT NULL
        AND lr.report_state IN ('reported', 'confirmed_complete', 'requires_review')
        AND lower(coalesce(lr.source_stop_type::text, '')) = 'delivery'
        AND lower(coalesce(lr.source_stop_status::text, '')) IN ('installed', 'completed')
        AND coalesce(lr.amount_reported, 0) >= lr.balance_due
      )
      OR (
        lr.report_id IS NULL
        AND fb.has_valid_fallback
      )
    ) AS payment_reported,
    (
      (
        lr.report_id IS NOT NULL
        AND NOT (
          lr.report_state IN ('reported', 'confirmed_complete', 'requires_review')
          AND lower(coalesce(lr.source_stop_type::text, '')) = 'delivery'
          AND lower(coalesce(lr.source_stop_status::text, '')) IN ('installed', 'completed')
          AND coalesce(lr.amount_reported, 0) >= lr.balance_due
        )
      )
      OR (
        lr.report_id IS NULL
        AND fb.has_any_fallback
        AND NOT fb.has_valid_fallback
      )
    ) AS payment_report_needs_review
  FROM latest_report lr
  JOIN fallback_delivery fb ON fb.booking_id = lr.booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_driver_booking_payment_reports(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_driver_booking_payment_reports(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_route_stop_status(
  p_stop_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_driver_name text;
  v_stop public.route_stops%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_now timestamptz := now();

  v_booking_balance numeric := 0;
  v_effective_balance numeric := 0;
  v_has_payment_exception boolean := false;
  v_has_valid_delivery_report boolean := false;
  v_has_stop_payment_cover boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF p_stop_id IS NULL THEN
    RAISE EXCEPTION 'Route stop id is required.';
  END IF;

  IF v_status NOT IN (
    'on_the_way',
    'arrived',
    'installed',
    'picked_up',
    'completed'
  ) THEN
    RAISE EXCEPTION 'Unsupported route stop status.';
  END IF;

  SELECT rd.name
    INTO v_driver_name
  FROM public.route_drivers rd
  WHERE rd.auth_user_id = v_user_id
    AND coalesce(rd.active, true) = true
    AND rd.deleted_at IS NULL
  ORDER BY rd.sort_order ASC NULLS LAST, rd.created_at ASC NULLS LAST, rd.id
  LIMIT 1;

  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'An active linked driver account is required.';
  END IF;

  SELECT rs.*
    INTO v_stop
  FROM public.route_stops rs
  WHERE rs.id = p_stop_id
    AND rs.driver_name = v_driver_name
    AND lower(coalesce(rs.stop_type::text, '')) IN ('delivery', 'pickup')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The route stop is not assigned to this driver.';
  END IF;

  IF v_status = 'installed' AND lower(coalesce(v_stop.stop_type::text, '')) <> 'delivery' THEN
    RAISE EXCEPTION 'Only a delivery stop can be marked installed.';
  END IF;

  IF v_status = 'picked_up' AND lower(coalesce(v_stop.stop_type::text, '')) <> 'pickup' THEN
    RAISE EXCEPTION 'Only a pickup stop can be marked picked up.';
  END IF;

  IF v_status IN ('installed', 'picked_up', 'completed') THEN
    IF v_stop.booking_id IS NOT NULL THEN
      SELECT greatest(coalesce(b.balance_due, 0), 0)
        INTO v_booking_balance
      FROM public.bookings b
      WHERE b.id = v_stop.booking_id;

      v_effective_balance := coalesce(v_booking_balance, 0);
    ELSE
      v_effective_balance := greatest(coalesce(v_stop.balance_due, 0), 0);
    END IF;

    v_has_stop_payment_cover := (
      coalesce(v_stop.payment_collected, false)
      AND (
        v_stop.booking_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.route_booking_payment_reports r
          WHERE r.booking_id = v_stop.booking_id
        )
      )
    );

    IF v_effective_balance > 0 AND NOT v_has_stop_payment_cover THEN
      IF lower(coalesce(v_stop.stop_type::text, '')) IN ('delivery', 'pickup')
         AND v_stop.booking_id IS NOT NULL
      THEN
        WITH latest_report AS (
          SELECT
            r.report_state,
            r.amount_reported,
            r.source_route_stop_id,
            rs.stop_type AS source_stop_type,
            rs.status AS source_stop_status
          FROM public.route_booking_payment_reports r
          LEFT JOIN public.route_stops rs
            ON rs.id = r.source_route_stop_id
          WHERE r.booking_id = v_stop.booking_id
          ORDER BY
            r.created_at DESC,
            CASE WHEN r.report_state = 'superseded' THEN 1 ELSE 0 END,
            r.id DESC
          LIMIT 1
        )
        SELECT coalesce(
          (
            lr.report_state IN ('reported', 'confirmed_complete', 'requires_review')
            AND lower(coalesce(lr.source_stop_type::text, '')) = 'delivery'
            AND (
              (
                lower(coalesce(v_stop.stop_type::text, '')) = 'delivery'
                AND lr.source_route_stop_id = v_stop.id
              )
              OR (
                lower(coalesce(v_stop.stop_type::text, '')) = 'pickup'
                AND lower(coalesce(lr.source_stop_status::text, '')) IN ('installed', 'completed')
              )
            )
            AND coalesce(lr.amount_reported, 0) >= v_effective_balance
          ),
          false
        )
        INTO v_has_valid_delivery_report
        FROM latest_report lr;

        IF NOT coalesce(v_has_valid_delivery_report, false)
           AND NOT EXISTS (
             SELECT 1
             FROM public.route_booking_payment_reports r
             WHERE r.booking_id = v_stop.booking_id
           )
        THEN
          SELECT EXISTS (
            SELECT 1
            FROM public.route_stops d
            WHERE d.booking_id = v_stop.booking_id
              AND lower(coalesce(d.stop_type::text, '')) = 'delivery'
              AND lower(coalesce(d.status::text, '')) IN ('installed', 'completed')
              AND coalesce(d.payment_collected, false) = true
              AND coalesce(d.payment_collected_amount, 0) >= v_effective_balance
          )
          INTO v_has_valid_delivery_report;
        END IF;
      ELSE
        v_has_valid_delivery_report := false;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.route_stop_payment_exceptions ex
        WHERE ex.route_stop_id = v_stop.id
          AND ex.booking_id IS NOT DISTINCT FROM v_stop.booking_id
          AND ex.is_active = true
      )
      INTO v_has_payment_exception;

      IF NOT coalesce(v_has_valid_delivery_report, false) AND NOT v_has_payment_exception THEN
        RAISE EXCEPTION 'Collect payment before completing this stop, or report Payment Not Collected with a reason.';
      END IF;
    END IF;

    IF lower(coalesce(v_stop.stop_type::text, '')) = 'delivery'
       AND NOT coalesce(v_stop.proof_photo_uploaded, false)
    THEN
      RAISE EXCEPTION 'Upload proof photo before completing this stop.';
    END IF;
  END IF;

  BEGIN
    PERFORM public.start_my_staff_time('driver_route');
  EXCEPTION
    WHEN others THEN
      IF sqlerrm <> 'A stale open work shift requires administrator review before work can be started.' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.route_stops
     SET status = v_status::public.route_stop_status,
         arrived_at = CASE
           WHEN v_status = 'arrived' THEN coalesce(arrived_at, v_now)
           ELSE arrived_at
         END,
         completed_at = CASE
           WHEN v_status IN ('installed', 'picked_up', 'completed') THEN coalesce(completed_at, v_now)
           ELSE completed_at
         END,
         updated_at = v_now
   WHERE id = p_stop_id
   RETURNING * INTO v_stop;

  RETURN jsonb_build_object(
    'id', v_stop.id,
    'status', v_stop.status,
    'arrived_at', v_stop.arrived_at,
    'completed_at', v_stop.completed_at,
    'payment_collected', v_stop.payment_collected,
    'payment_not_collected_reported', v_has_payment_exception,
    'proof_photo_uploaded', v_stop.proof_photo_uploaded,
    'updated_at', v_stop.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_route_stop_status(uuid, text)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.update_my_route_stop_status(uuid, text)
  TO authenticated;

COMMIT;
