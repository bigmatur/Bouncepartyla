import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess } from "@/lib/auth/access";

const ACTIVE_RESERVATION_STATUSES = ["reserved", "picked", "loaded", "installed"];
const AVAILABLE_UNIT_STATUSES = ["available", "returned"];

const CUSTOMER_WORKING_HOURS = {
  open: "08:00",
  close: "21:00",
};

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toLaDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-07:00`);
}

function timeToMinutes(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function validateCustomerTime(params: {
  startTime: string;
  endTime: string;
}) {
  const openMinutes = timeToMinutes(CUSTOMER_WORKING_HOURS.open);
  const closeMinutes = timeToMinutes(CUSTOMER_WORKING_HOURS.close);

  const startMinutes = timeToMinutes(params.startTime);
  const endMinutes = timeToMinutes(params.endTime);

  if (endMinutes <= startMinutes) {
    throw new Error(
      `Customer bookings must be within working hours: ${CUSTOMER_WORKING_HOURS.open}–${CUSTOMER_WORKING_HOURS.close}. Overnight booking is only allowed for cashier/admin.`,
    );
  }

  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    throw new Error(
      `Customer bookings are only available from ${CUSTOMER_WORKING_HOURS.open} to ${CUSTOMER_WORKING_HOURS.close}. Cashier/admin can use any time.`,
    );
  }
}

function getEventWindow(params: {
  eventDate: string;
  startTime: string;
  endTime: string;
  bookingActor: "customer" | "cashier";
}) {
  if (params.bookingActor === "customer") {
    validateCustomerTime({
      startTime: params.startTime,
      endTime: params.endTime,
    });
  }

  const eventStart = toLaDateTime(params.eventDate, params.startTime);
  const eventEnd = toLaDateTime(params.eventDate, params.endTime);

  if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
    throw new Error("Invalid date or time.");
  }

  if (eventEnd <= eventStart) {
    eventEnd.setDate(eventEnd.getDate() + 1);
  }

  return {
    eventStart,
    eventEnd,
  };
}

function getRecipeItem(recipe: any) {
  if (Array.isArray(recipe.inventory_items)) {
    return recipe.inventory_items[0];
  }

  return recipe.inventory_items;
}

function checkRecipeAvailable(params: {
  recipe: any;
  units: any[];
  reservations: any[];
}) {
  const { recipe, units, reservations } = params;
  const item = getRecipeItem(recipe);

  if (!item) {
    return {
      available: false,
      reason: "Inventory item not found.",
      itemName: "Unknown item",
    };
  }

  if (!item.active) {
    return {
      available: false,
      reason: `${item.name} is inactive.`,
      itemName: item.name,
    };
  }

  const quantityRequired = Number(recipe.quantity_required || 0);

  if (quantityRequired <= 0) {
    return {
      available: true,
      reason: "No quantity required.",
      itemName: item.name,
    };
  }

  const overlapping = reservations.filter((reservation) => {
    return reservation.inventory_item_id === item.id;
  });

  if (item.tracking_type === "serialized" || item.tracking_type === "kit") {
    const reservedUnitIds = new Set(
      overlapping
        .map((reservation) => reservation.inventory_unit_id)
        .filter(Boolean),
    );

    const availableUnits = units.filter((unit) => {
      if (unit.inventory_item_id !== item.id) {
        return false;
      }

      if (!AVAILABLE_UNIT_STATUSES.includes(unit.status)) {
        return false;
      }

      return !reservedUnitIds.has(unit.id);
    });

    if (availableUnits.length < quantityRequired) {
      return {
        available: false,
        reason: `${item.name} unavailable. Required: ${quantityRequired}, available: ${availableUnits.length}.`,
        itemName: item.name,
      };
    }

    return {
      available: true,
      reason: `${item.name} available.`,
      itemName: item.name,
    };
  }

  const reservedQuantity = overlapping.reduce((sum, reservation) => {
    return sum + Number(reservation.quantity || 0);
  }, 0);

  const availableQuantity = Number(item.total_quantity || 0) - reservedQuantity;

  if (availableQuantity < quantityRequired) {
    return {
      available: false,
      reason: `${item.name} unavailable. Required: ${quantityRequired}, available: ${availableQuantity}.`,
      itemName: item.name,
    };
  }

  return {
    available: true,
    reason: `${item.name} available.`,
    itemName: item.name,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const productId = searchParams.get("productId");
    const eventDate = searchParams.get("eventDate");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    /*
     * Never trust bookingActor from the browser.
     *
     * Public/unauthenticated requests always use customer rules.
     * Cashier rules are enabled only after the server confirms that the
     * authenticated account is active staff with permission to create bookings.
     */
    const requestedActor =
      searchParams.get("bookingActor") === "cashier"
        ? "cashier"
        : "customer";

    let bookingActor: "customer" | "cashier" = "customer";

    if (requestedActor === "cashier") {
      const access = await getUnifiedAccess(supabase);

      if (
        access.user &&
        access.isActive &&
        access.can("bookings.create")
      ) {
        bookingActor = "cashier";
      }
    }

    if (!productId || !eventDate || !startTime || !endTime) {
      return NextResponse.json(
        {
          available: false,
          message: "Select product, date, start time and end time.",
        },
        { status: 400 },
      );
    }

    const productResult = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        setup_minutes,
        teardown_minutes,
        buffer_before_minutes,
        buffer_after_minutes
      `,
      )
      .eq("id", productId)
      .single();

    if (productResult.error) {
      return NextResponse.json(
        {
          available: false,
          message: productResult.error.message,
        },
        { status: 500 },
      );
    }

    if (!productResult.data) {
      return NextResponse.json(
        {
          available: false,
          message: "Product not found.",
        },
        { status: 404 },
      );
    }

    const product = productResult.data;

    const { eventStart, eventEnd } = getEventWindow({
      eventDate,
      startTime,
      endTime,
      bookingActor,
    });

    const reservedFrom = subtractMinutes(
      eventStart,
      Number(product.setup_minutes || 0) +
        Number(product.buffer_before_minutes || 0),
    );

    const reservedUntil = addMinutes(
      eventEnd,
      Number(product.teardown_minutes || 0) +
        Number(product.buffer_after_minutes || 0),
    );

    const recipesResult = await supabase
      .from("inventory_recipes")
      .select(
        `
        id,
        product_id,
        modifier_id,
        inventory_item_id,
        quantity_required,
        requirement_type,
        alternative_group,
        is_optional,
        inventory_items (
          id,
          name,
          tracking_type,
          total_quantity,
          active
        )
      `,
      )
      .eq("product_id", productId)
      .is("modifier_id", null);

    if (recipesResult.error) {
      return NextResponse.json(
        {
          available: false,
          message: recipesResult.error.message,
        },
        { status: 500 },
      );
    }

    const recipes = recipesResult.data || [];

    if (recipes.length === 0) {
      return NextResponse.json({
        available: false,
        message:
          "This product has no inventory recipe. Add inventory recipe first.",
        bookingActor,
        reservedFrom: reservedFrom.toISOString(),
        reservedUntil: reservedUntil.toISOString(),
      });
    }

    const inventoryItemIds = recipes
      .map((recipe: any) => recipe.inventory_item_id)
      .filter(Boolean);

    if (inventoryItemIds.length === 0) {
      return NextResponse.json({
        available: false,
        message: "Inventory recipe exists, but no inventory items are linked.",
        bookingActor,
        reservedFrom: reservedFrom.toISOString(),
        reservedUntil: reservedUntil.toISOString(),
      });
    }

    const unitsResult = await supabase
      .from("inventory_units")
      .select("id, inventory_item_id, unit_code, status")
      .in("inventory_item_id", inventoryItemIds);

    if (unitsResult.error) {
      return NextResponse.json(
        {
          available: false,
          message: unitsResult.error.message,
        },
        { status: 500 },
      );
    }

    const reservationsResult = await supabase
      .from("inventory_reservations")
      .select(
        `
        id,
        booking_id,
        booking_item_id,
        inventory_item_id,
        inventory_unit_id,
        quantity,
        reserved_from,
        reserved_until,
        status
      `,
      )
      .lt("reserved_from", reservedUntil.toISOString())
      .gt("reserved_until", reservedFrom.toISOString())
      .in("status", ACTIVE_RESERVATION_STATUSES);

    if (reservationsResult.error) {
      return NextResponse.json(
        {
          available: false,
          message: reservationsResult.error.message,
        },
        { status: 500 },
      );
    }

    const units = unitsResult.data || [];
    const reservations = reservationsResult.data || [];

    const normalRecipes = recipes.filter((recipe: any) => {
      return (
        !recipe.alternative_group &&
        !recipe.is_optional &&
        recipe.requirement_type !== "optional"
      );
    });

    const alternativeGroups = new Map<string, any[]>();

    for (const recipe of recipes) {
      if (!recipe.alternative_group) {
        continue;
      }

      const groupRecipes = alternativeGroups.get(recipe.alternative_group) || [];
      groupRecipes.push(recipe);
      alternativeGroups.set(recipe.alternative_group, groupRecipes);
    }

    const checks: any[] = [];

    for (const recipe of normalRecipes) {
      const check = checkRecipeAvailable({
        recipe,
        units,
        reservations,
      });

      checks.push(check);

      if (!check.available) {
        return NextResponse.json({
          available: false,
          message: check.reason,
          bookingActor,
          reservedFrom: reservedFrom.toISOString(),
          reservedUntil: reservedUntil.toISOString(),
          checks,
        });
      }
    }

    for (const [groupName, groupRecipes] of alternativeGroups.entries()) {
      const groupChecks = groupRecipes.map((recipe) => {
        return checkRecipeAvailable({
          recipe,
          units,
          reservations,
        });
      });

      checks.push({
        alternativeGroup: groupName,
        options: groupChecks,
      });

      const hasAvailableOption = groupChecks.some((check) => check.available);

      if (!hasAvailableOption) {
        return NextResponse.json({
          available: false,
          message: `No available option for ${groupName}.`,
          bookingActor,
          reservedFrom: reservedFrom.toISOString(),
          reservedUntil: reservedUntil.toISOString(),
          checks,
        });
      }
    }

    return NextResponse.json({
      available: true,
      message:
        bookingActor === "customer"
          ? `${product.name} is available within customer working hours.`
          : `${product.name} is available. Cashier override time is allowed.`,
      bookingActor,
      customerWorkingHours: CUSTOMER_WORKING_HOURS,
      reservedFrom: reservedFrom.toISOString(),
      reservedUntil: reservedUntil.toISOString(),
      checks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not check availability.",
      },
      { status: 500 },
    );
  }
}