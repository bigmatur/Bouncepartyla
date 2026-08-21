import "server-only";

import { cache } from "react";

import {
  notFound,
  redirect,
} from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import type { BookingDetails } from "./booking-types";
import { normalizeBookingDetails } from "./booking-page-utils";

function isOptionalReadError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42p01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("permission denied")
  );
}

async function getCustomerBookingRouteStops(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
) {
  const { data, error } = await supabase.rpc(
    "get_my_booking_route_stops",
    {
      p_booking_id: bookingId,
    },
  );

  if (error) {
    if (!isOptionalReadError(error)) {
      console.error(
        "Customer booking route stops error:",
        {
          bookingId,
          message: error.message,
          code: error.code,
        },
      );
    }

    return [];
  }

  return Array.isArray(data)
    ? data
    : [];
}

async function overlayAuthoritativeCustomerState(params: {
  bookingId: string;
  details: BookingDetails;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_my_booking_authoritative_state",
    {
      p_booking_id: params.bookingId,
    },
  );

  if (error) {
    if (isOptionalReadError(error)) {
      console.error(
        "Customer authoritative booking state RPC unavailable:",
        {
          bookingId:
            params.bookingId,
          message:
            error.message,
          code:
            error.code,
        },
      );

      return params.details;
    }

    throw new Error(
      error.message,
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return params.details;
  }

  const authoritativeState =
    data as {
      booking?:
        | Record<string, unknown>
        | null;
      payments?:
        | unknown[]
        | null;
      contract?:
        | Record<string, unknown>
        | null;
    };

  const bookingRow =
    authoritativeState.booking;

  if (
    !bookingRow ||
    typeof bookingRow !==
      "object" ||
    Array.isArray(bookingRow)
  ) {
    return params.details;
  }

  const authoritativeBooking = {
    ...params.details.booking,
    ...bookingRow,

    subtotal:
      Number(
        bookingRow.subtotal ||
          0,
      ),

    modifiers_total:
      Number(
        bookingRow.modifiers_total ||
          0,
      ),

    delivery_fee:
      Number(
        bookingRow.delivery_fee ||
          0,
      ),

    discount_amount:
      Number(
        bookingRow.discount_amount ||
          0,
      ),

    tax_rate:
      Number(
        bookingRow.tax_rate ||
          0,
      ),

    tax_amount:
      Number(
        bookingRow.tax_amount ||
          0,
      ),

    total_amount:
      Number(
        bookingRow.total_amount ||
          0,
      ),

    deposit_amount:
      Number(
        bookingRow.deposit_amount ||
          0,
      ),

    amount_paid:
      Number(
        bookingRow.amount_paid ||
          0,
      ),

    balance_due:
      Number(
        bookingRow.balance_due ||
          0,
      ),

    payment_status:
      String(
        bookingRow.payment_status ||
          "unpaid",
      ),

    contract_status:
      String(
        bookingRow.contract_status ||
          "not_sent",
      ),

    booking_source:
      bookingRow.booking_source ||
      null,
  };

  const authoritativePayments =
    Array.isArray(
      authoritativeState.payments,
    )
      ? authoritativeState.payments
      : params.details.payments;

  const authoritativeContract =
    authoritativeState.contract &&
    typeof authoritativeState.contract ===
      "object" &&
    !Array.isArray(
      authoritativeState.contract,
    )
      ? authoritativeState.contract
      : params.details.contract;

  return normalizeBookingDetails({
    ...params.details,

    booking:
      authoritativeBooking as any,

    payments:
      authoritativePayments as any,

    contract:
      authoritativeContract as any,
  });
}

async function getCustomerBookingDetailsFromTables(params: {
  bookingId: string;
}) {
  const { bookingId } =
    params;

  const supabase =
    await createClient();

  const bookingResult =
    await supabase
      .from("bookings")
      .select("*")
      .eq(
        "id",
        bookingId,
      )
      .maybeSingle();

  if (bookingResult.error) {
    throw new Error(
      bookingResult.error.message,
    );
  }

  if (!bookingResult.data) {
    return null;
  }

  const bookingItemRowsResult =
    await supabase
      .from("booking_items")
      .select("*")
      .eq(
        "booking_id",
        bookingId,
      );

  if (
    bookingItemRowsResult.error
  ) {
    throw new Error(
      bookingItemRowsResult.error
        .message,
    );
  }

  const bookingItemRows =
    bookingItemRowsResult.data ||
    [];

  const productIds =
    Array.from(
      new Set(
        bookingItemRows
          .map(
            (row: any) =>
              String(
                row.product_id ||
                  "",
              ),
          )
          .filter(Boolean),
      ),
    );

  let productRows: any[] = [];

  if (
    productIds.length > 0
  ) {
    const productsResult =
      await supabase
        .from("products")
        .select(`
          id,
          name,
          slug,
          description,
          short_description,
          image_url,
          gallery_urls,
          category_id,
          setup_width_ft,
          setup_length_ft,
          setup_height_ft,
          min_age,
          max_age,
          max_capacity
        `)
        .in(
          "id",
          productIds,
        );

    if (
      productsResult.error
    ) {
      throw new Error(
        productsResult.error
          .message,
      );
    }

    productRows =
      productsResult.data ||
      [];
  }

  const categoryIds =
    Array.from(
      new Set(
        productRows
          .map(
            (row: any) =>
              String(
                row.category_id ||
                  "",
              ),
          )
          .filter(Boolean),
      ),
    );

  let categoryRows: any[] = [];

  if (
    categoryIds.length > 0
  ) {
    const categoriesResult =
      await supabase
        .from("categories")
        .select(
          "id, name, slug",
        )
        .in(
          "id",
          categoryIds,
        );

    if (
      !categoriesResult.error
    ) {
      categoryRows =
        categoriesResult.data ||
        [];
    }
  }

  const productById =
    new Map(
      productRows.map(
        (row: any) => [
          String(row.id),
          row,
        ],
      ),
    );

  const categoryById =
    new Map(
      categoryRows.map(
        (row: any) => [
          String(row.id),
          row,
        ],
      ),
    );

  const items =
    bookingItemRows.map(
      (row: any) => {
        const product =
          productById.get(
            String(
              row.product_id ||
                "",
            ),
          );

        const category =
          categoryById.get(
            String(
              product?.category_id ||
                "",
            ),
          );

        return {
          id:
            String(row.id),

          product_id:
            String(
              row.product_id,
            ),

          product_name:
            String(
              product?.name ||
                "Product",
            ),

          product_slug:
            String(
              product?.slug ||
                "",
            ),

          product_description:
            product?.description ||
            null,

          product_short_description:
            product?.short_description ||
            null,

          product_image_url:
            product?.image_url ||
            null,

          product_gallery_urls:
            Array.isArray(
              product?.gallery_urls,
            )
              ? product.gallery_urls
              : [],

          category_id:
            product?.category_id ||
            null,

          category_name:
            category?.name ||
            null,

          category_slug:
            category?.slug ||
            null,

          variant_id:
            row.variant_id ||
            null,

          variant_name:
            null,

          quantity:
            Number(
              row.quantity ||
                0,
            ),

          unit_price:
            Number(
              row.unit_price ||
                0,
            ),

          subtotal:
            Number(
              row.subtotal ||
                0,
            ),

          setup_width_ft:
            product
              ?.setup_width_ft ??
            null,

          setup_length_ft:
            product
              ?.setup_length_ft ??
            null,

          setup_height_ft:
            product
              ?.setup_height_ft ??
            null,

          min_age:
            product?.min_age ??
            null,

          max_age:
            product?.max_age ??
            null,

          max_capacity:
            product
              ?.max_capacity ??
            null,

          item_components:
            [],
        };
      },
    );

  const modifiersResult =
    await supabase
      .from("booking_modifiers")
      .select("*")
      .eq(
        "booking_id",
        bookingId,
      );

  const modifiers =
    (
      modifiersResult.error
        ? []
        : modifiersResult.data ||
          []
    ).map(
      (row: any) => ({
        id:
          String(row.id),

        booking_item_id:
          row.booking_item_id ||
          null,

        modifier_id:
          String(
            row.modifier_id ||
              "",
          ),

        modifier_name:
          null,

        modifier_description:
          null,

        group_id:
          row.modifier_group_id ||
          null,

        group_name:
          null,

        group_description:
          null,

        option_id:
          row.modifier_group_option_id ||
          row.option_id ||
          null,

        option_name:
          null,

        option_description:
          null,

        image_url:
          null,

        quantity:
          Number(
            row.quantity ||
              0,
          ),

        unit_price:
          Number(
            row.unit_price ||
              0,
          ),

        price_delta:
          Number(
            row.unit_price ||
              0,
          ),

        subtotal:
          Number(
            row.subtotal ||
              0,
          ),

        notes:
          row.notes ||
          null,

        modifier_group_id:
          row.modifier_group_id ||
          null,

        modifier_group_option_id:
          row.modifier_group_option_id ||
          row.option_id ||
          null,
      }),
    );

  /*
   * Customer access to contracts/payments is intentionally not done
   * through direct table reads here.
   *
   * The authoritative state is supplied by
   * get_my_booking_authoritative_state().
   */
  let contract: any =
    null;

  let payments: any[] =
    [];

  const {
    data:
      authoritativeData,
    error:
      authoritativeError,
  } = await supabase.rpc(
    "get_my_booking_authoritative_state",
    {
      p_booking_id:
        bookingId,
    },
  );

  if (
    authoritativeError &&
    !isOptionalReadError(
      authoritativeError,
    )
  ) {
    throw new Error(
      authoritativeError.message,
    );
  }

  if (
    authoritativeData &&
    typeof authoritativeData ===
      "object" &&
    !Array.isArray(
      authoritativeData,
    )
  ) {
    const state =
      authoritativeData as {
        contract?: unknown;
        payments?: unknown;
      };

    if (
      state.contract &&
      typeof state.contract ===
        "object" &&
      !Array.isArray(
        state.contract,
      )
    ) {
      contract =
        state.contract;
    }

    if (
      Array.isArray(
        state.payments,
      )
    ) {
      payments =
        state.payments;
    }
  }

  let photos: any[] =
    [];

  const photosResult =
    await supabase
      .from("booking_photos")
      .select("*")
      .eq(
        "booking_id",
        bookingId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      );

  const bookingRow =
    bookingResult.data as any;

  const booking = {
    ...bookingRow,

    booking_number:
      bookingRow.booking_number ||
      null,

    status:
      String(
        bookingRow.status ||
          "booked",
      ),

    event_date:
      String(
        bookingRow.event_date ||
          "",
      ),

    event_start_time:
      bookingRow.event_start_time ||
      null,

    event_end_time:
      bookingRow.event_end_time ||
      null,

    delivery_date:
      bookingRow.delivery_date ||
      null,

    pickup_date:
      bookingRow.pickup_date ||
      null,

    delivery_window_start:
      bookingRow.delivery_window_start ||
      null,

    delivery_window_end:
      bookingRow.delivery_window_end ||
      null,

    pickup_window_start:
      bookingRow.pickup_window_start ||
      null,

    pickup_window_end:
      bookingRow.pickup_window_end ||
      null,

    setup_address:
      bookingRow.setup_address ||
      null,

    setup_city:
      bookingRow.setup_city ||
      null,

    setup_state:
      bookingRow.setup_state ||
      null,

    setup_zip:
      bookingRow.setup_zip ||
      null,

    venue_type:
      bookingRow.venue_type ||
      null,

    surface_type:
      bookingRow.surface_type ||
      null,

    power_available:
      bookingRow.power_available ??
      null,

    generator_required:
      Boolean(
        bookingRow.generator_required,
      ),

    subtotal:
      Number(
        bookingRow.subtotal ||
          0,
      ),

    modifiers_total:
      Number(
        bookingRow.modifiers_total ||
          0,
      ),

    delivery_fee:
      Number(
        bookingRow.delivery_fee ||
          0,
      ),

    discount_amount:
      Number(
        bookingRow.discount_amount ||
          0,
      ),

    tax_rate:
      Number(
        bookingRow.tax_rate ||
          0,
      ),

    tax_amount:
      Number(
        bookingRow.tax_amount ||
          0,
      ),

    total_amount:
      Number(
        bookingRow.total_amount ||
          0,
      ),

    deposit_amount:
      Number(
        bookingRow.deposit_amount ||
          0,
      ),

    amount_paid:
      Number(
        bookingRow.amount_paid ||
          0,
      ),

    balance_due:
      Number(
        bookingRow.balance_due ||
          0,
      ),

    payment_status:
      String(
        bookingRow.payment_status ||
          "unpaid",
      ),

    contract_status:
      String(
        bookingRow.contract_status ||
          "not_sent",
      ),

    delivery_status:
      bookingRow.delivery_status ||
      null,

    pickup_status:
      bookingRow.pickup_status ||
      null,

    coi_required:
      Boolean(
        bookingRow.coi_required,
      ),

    coi_status:
      String(
        bookingRow.coi_status ||
          "not_required",
      ),

    ball_colors:
      bookingRow.ball_colors ||
      null,

    customer_notes:
      bookingRow.customer_notes ||
      null,

    setup_photo_url:
      bookingRow.setup_photo_url ||
      null,

    pickup_photo_url:
      bookingRow.pickup_photo_url ||
      null,

    created_at:
      String(
        bookingRow.created_at ||
          new Date().toISOString(),
      ),
  };

  if (
    !photosResult.error
  ) {
    photos =
      photosResult.data ||
      [];
  } else if (
    !isOptionalReadError(
      photosResult.error,
    )
  ) {
    throw new Error(
      photosResult.error
        .message,
    );
  }

  const routeStops =
    await getCustomerBookingRouteStops(
      supabase,
      bookingId,
    );

  return normalizeBookingDetails({
    booking:
      booking as any,

    items:
      items as any,

    modifiers:
      modifiers as any,

    contract:
      contract as any,

    payments:
      payments as any,

    photos:
      photos as any,

    route_stops:
      routeStops as any,
  });
}

export const getCustomerBookingDetails =
  cache(
    async (
      bookingId: string,
    ): Promise<BookingDetails> => {
      const supabase =
        await createClient();

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        redirect(
          `/account/login?next=${encodeURIComponent(
            `/account/bookings/${bookingId}`,
          )}`,
        );
      }

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_my_booking_details",
          {
            p_booking_id:
              bookingId,
          },
        );

      if (error) {
        console.error(
          "Customer booking details error:",
          {
            bookingId,
            userId:
              user.id,
            message:
              error.message,
            code:
              error.code,
          },
        );

        const fallback =
          await getCustomerBookingDetailsFromTables(
            {
              bookingId,
            },
          );

        if (!fallback) {
          notFound();
        }

        return fallback;
      }

      if (
        !data ||
        typeof data !==
          "object" ||
        Array.isArray(data)
      ) {
        const fallback =
          await getCustomerBookingDetailsFromTables(
            {
              bookingId,
            },
          );

        if (!fallback) {
          notFound();
        }

        return fallback;
      }

      const routeStops =
        await getCustomerBookingRouteStops(
          supabase,
          bookingId,
        );

      const details =
        normalizeBookingDetails({
          ...(
            data as Partial<BookingDetails>
          ),

          route_stops:
            routeStops as any,
        });

      if (
        !details.booking
      ) {
        notFound();
      }

      /*
       * get_my_booking_details supplies the rich customer payload.
       *
       * The authoritative financial/payment/contract state is overlaid
       * through a SECURITY DEFINER RPC instead of service-role table reads.
       */
      return overlayAuthoritativeCustomerState(
        {
          bookingId,
          details,
        },
      );
    },
  );