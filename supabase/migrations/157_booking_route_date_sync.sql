-- 157_booking_route_date_sync.sql
--
-- Atomically update booking schedule and shift existing delivery/pickup stops.
--
-- IMPORTANT:
-- Review and test before applying to Production.

CREATE OR REPLACE FUNCTION public.admin_reschedule_booking_with_route_stops(
  p_booking_id uuid,
  p_expected_event_date date,
  p_event_date date,
  p_event_start_time time without time zone,
  p_event_end_time time without time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_day_offset integer;
  v_invalid_count integer;
BEGIN

  -- ============================================================
  -- 1. Authorization
  -- ============================================================

  IF auth.uid() IS NULL
     OR NOT public.current_user_can_manage_routes()
  THEN
    RAISE EXCEPTION
      'Permission denied to reschedule booking'
      USING ERRCODE = '42501';
  END IF;

  -- ============================================================
  -- 2. Validate input
  -- ============================================================

  IF p_booking_id IS NULL
     OR p_expected_event_date IS NULL
     OR p_event_date IS NULL
     OR p_event_start_time IS NULL
     OR p_event_end_time IS NULL
  THEN
    RAISE EXCEPTION
      'Booking ID, original date, new date and times are required'
      USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 3. Lock booking
  -- ============================================================

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Booking not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- ============================================================
  -- 4. Optimistic concurrency check
  -- ============================================================

  IF v_booking.event_date <> p_expected_event_date THEN
    RAISE EXCEPTION
      'Booking date was changed by another administrator. Refresh the page and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- ============================================================
  -- 5. Calculate calendar-day difference
  -- ============================================================

  v_day_offset := p_event_date - v_booking.event_date;

  -- ============================================================
  -- 6. Move existing delivery/pickup stops
  -- ============================================================

  IF v_day_offset <> 0 THEN

    -- Lock all related delivery/pickup stops.

    PERFORM 1
    FROM public.route_stops
    WHERE booking_id = p_booking_id
      AND stop_type IN ('delivery', 'pickup')
    FOR UPDATE;

    -- Do not automatically move active, completed or cancelled stops.

    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.route_stops
    WHERE booking_id = p_booking_id
      AND stop_type IN ('delivery', 'pickup')
      AND status NOT IN ('scheduled', 'rescheduled');

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION
        'Cannot reschedule booking: delivery or pickup is already active, completed, or cancelled'
        USING ERRCODE = 'P0001';
    END IF;

    -- Shift dates while preserving relative offsets.
    --
    -- Preserve:
    --   scheduled_start_time
    --   scheduled_end_time
    --   time_locked
    --   sort_order
    --   status
    --   address and notes
    --
    -- Reset:
    --   driver_name
    --   truck_name

    UPDATE public.route_stops
    SET
      stop_date = stop_date + v_day_offset,
      driver_name = NULL,
      truck_name = NULL,
      updated_at = NOW()
    WHERE booking_id = p_booking_id
      AND stop_type IN ('delivery', 'pickup')
      AND status IN ('scheduled', 'rescheduled');

  END IF;

  -- ============================================================
  -- 7. Update booking schedule
  -- ============================================================

  UPDATE public.bookings
  SET
    event_date = p_event_date,
    event_start_time = p_event_start_time,
    event_end_time = p_event_end_time,

    delivery_date = CASE
      WHEN v_day_offset <> 0
           AND delivery_date IS NOT NULL
      THEN delivery_date + v_day_offset
      ELSE delivery_date
    END,

    pickup_date = CASE
      WHEN v_day_offset <> 0
           AND pickup_date IS NOT NULL
      THEN pickup_date + v_day_offset
      ELSE pickup_date
    END

  WHERE id = p_booking_id;

END;
$$;

-- ============================================================
-- 8. Function permissions
-- ============================================================

REVOKE ALL ON FUNCTION public.admin_reschedule_booking_with_route_stops(
  uuid,
  date,
  date,
  time without time zone,
  time without time zone
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_reschedule_booking_with_route_stops(
  uuid,
  date,
  date,
  time without time zone,
  time without time zone
) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_reschedule_booking_with_route_stops(
  uuid,
  date,
  date,
  time without time zone,
  time without time zone
) TO authenticated;
