import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getUnifiedAccess,
  isStaffRole,
} from "@/lib/auth/access";
import { loadAdminNewBookingBootstrap } from "@/lib/booking/admin-new-booking-bootstrap";
import { calculateCanonicalBookingPricing } from "@/lib/booking/canonical-pricing";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function moneyNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function positiveInteger(value: unknown, fallback = 1) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function POST(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return unauthorized();

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return NextResponse.json(
      { success: false, error: "Server Supabase configuration is missing." },
      { status: 500 },
    );
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return unauthorized("Invalid or expired session.");
  }

  const access = await getUnifiedAccess(supabase);
  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("bookings.create")
  ) {
    return forbidden("Access denied. Missing permission: bookings.create");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const setupAddress = String(body.setupAddress || "").trim();
  const setupCity = String(body.setupCity || "").trim();
  const setupState = String(body.setupState || "CA").trim() || "CA";
  const setupZip = String(body.setupZip || "").trim();

  if (!setupAddress || !setupCity || !setupZip) {
    return badRequest("Setup address, city, and ZIP are required.");
  }

  const requestedProducts = Array.isArray(body.products) ? body.products : [];
  if (requestedProducts.length === 0) {
    return badRequest("Select at least one product.");
  }

  const requestedModifiers = Array.isArray(body.modifiers) ? body.modifiers : [];

  try {
    const bootstrap = await loadAdminNewBookingBootstrap(supabase);

    const productsById = new Map(
      (bootstrap.products || [])
        .filter((product: any) => product.active !== false)
        .map((product: any) => [String(product.id), product]),
    );

    const productQuantityById = new Map<string, number>();

    for (const raw of requestedProducts) {
      const row = raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
      const productId = String(row.productId || "").trim();

      if (!productId) return badRequest("A selected product is missing its ID.");
      if (!productsById.has(productId)) {
        return badRequest("One or more selected products are no longer available.");
      }

      const quantity = Math.min(positiveInteger(row.quantity, 1), 99);
      productQuantityById.set(
        productId,
        (productQuantityById.get(productId) || 0) + quantity,
      );
    }

    const productLines = Array.from(productQuantityById.entries()).map(
      ([productId, quantity]) => {
        const product = productsById.get(productId);
        const unitPrice = moneyNumber(product?.base_price ?? product?.price ?? 0);
        return {
          productId,
          name: String(product?.name || "Product").trim() || "Product",
          quantity,
          unitPrice,
          lineTotal: moneyNumber(unitPrice * quantity),
        };
      },
    );

    const productSubtotal = moneyNumber(
      productLines.reduce((sum, line) => sum + line.lineTotal, 0),
    );

    const minimumDeposit = moneyNumber(
      Array.from(productQuantityById.entries()).reduce(
        (sum, [productId, quantity]) => {
          const product = productsById.get(productId);
          return sum + moneyNumber(product?.deposit_amount || 0) * quantity;
        },
        0,
      ),
    );

    const groups = (bootstrap.modifierGroups || []).filter(
      (group: any) =>
        group.active !== false &&
        productQuantityById.has(String(group.productId)),
    );

    const groupByKey = new Map(
      groups.map((group: any) => [
        `${String(group.productId)}:${String(group.id)}`,
        group,
      ]),
    );

    const selectedByGroup = new Map<string, Map<string, number>>();

    for (const raw of requestedModifiers) {
      const row = raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
      const productId = String(row.productId || "").trim();
      const groupId = String(row.groupId || "").trim();
      const optionId = String(row.optionId || "").trim();

      if (!productQuantityById.has(productId)) {
        return badRequest("A selected option belongs to an unselected product.");
      }

      const groupKey = `${productId}:${groupId}`;
      const group = groupByKey.get(groupKey);
      if (!group) {
        return badRequest("One or more selected option groups are no longer available.");
      }

      const option = (group.options || []).find(
        (item: any) => String(item.id) === optionId && item.active !== false,
      );
      if (!option) {
        return badRequest("One or more selected options are no longer available.");
      }

      const requestedQuantity = positiveInteger(row.quantity, 1);
      const quantity =
        String(group.selectionType || "single") === "single"
          ? 1
          : Math.min(requestedQuantity, 99);

      const selectedOptions = selectedByGroup.get(groupKey) || new Map<string, number>();
      selectedOptions.set(
        optionId,
        (selectedOptions.get(optionId) || 0) + quantity,
      );
      selectedByGroup.set(groupKey, selectedOptions);
    }

    for (const group of groups) {
      const productId = String(group.productId);
      const groupId = String(group.id);
      const groupKey = `${productId}:${groupId}`;
      const selected = selectedByGroup.get(groupKey);
      const totalSelected = Array.from(selected?.values() || []).reduce(
        (sum, quantity) => sum + quantity,
        0,
      );

      if (group.required === true && totalSelected < 1) {
        return badRequest(
          `Required option group "${String(group.name || "Options")}" is incomplete.`,
        );
      }

      if (
        String(group.selectionType || "single") === "single" &&
        totalSelected > 1
      ) {
        return badRequest(
          `Option group "${String(group.name || "Options")}" allows only one selection.`,
        );
      }

      const maximum =
        group.maxTotalQuantity == null
          ? null
          : positiveInteger(group.maxTotalQuantity, 1);

      if (maximum != null && totalSelected > maximum) {
        return badRequest(
          `Option group "${String(group.name || "Options")}" exceeds its maximum quantity.`,
        );
      }
    }

    const modifierLines: Array<{
      productId: string;
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      quantity: number;
      productQuantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const [groupKey, selectedOptions] of selectedByGroup.entries()) {
      const group = groupByKey.get(groupKey);
      if (!group) continue;

      const productId = String(group.productId);
      const productQuantity = productQuantityById.get(productId) || 1;

      for (const [optionId, quantity] of selectedOptions.entries()) {
        const option = (group.options || []).find(
          (item: any) => String(item.id) === optionId,
        );
        if (!option) continue;

        const unitPrice = moneyNumber(option.priceDelta || 0);
        modifierLines.push({
          productId,
          groupId: String(group.id),
          groupName: String(group.name || "Options").trim() || "Options",
          optionId,
          optionName: String(option.name || "Option").trim() || "Option",
          quantity,
          productQuantity,
          unitPrice,
          lineTotal: moneyNumber(unitPrice * quantity * productQuantity),
        });
      }
    }

    const modifiersSubtotal = moneyNumber(
      modifierLines.reduce((sum, line) => sum + line.lineTotal, 0),
    );
    const subtotal = moneyNumber(productSubtotal + modifiersSubtotal);

    if (subtotal <= 0) {
      return badRequest("Booking subtotal must be greater than zero.");
    }

    const canonical = await calculateCanonicalBookingPricing({
      supabase,
      setupAddress,
      setupCity,
      setupState,
      setupZip,
      subtotal,
      depositAmount: minimumDeposit,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...canonical,
        products: productLines,
        modifiers: modifierLines,
        productSubtotal,
        modifiersSubtotal,
        subtotal,
        minimumDeposit,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not calculate booking pricing.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
