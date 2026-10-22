import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const modulePath = path.join(
  process.cwd(),
  "src/lib/booking/operational-equipment.ts",
);

function loadOperationalEquipmentModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  }).outputText;

  const module = { exports: {} };
  const cjsRequire = createRequire(filePath);
  const sandbox = {
    module,
    exports: module.exports,
    require: cjsRequire,
    console,
    process,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return module.exports;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTable(table) {
  return table.map((row) => ({ ...row }));
}

function createMockSupabase(seed) {
  const state = {
    booking_items: normalizeTable(seed.booking_items || []),
    inventory_reservations: normalizeTable(seed.inventory_reservations || []),
    booking_checklist_items: normalizeTable(seed.booking_checklist_items || []),
  };

  function filterRows(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        const value = row[filter.column];
        if (filter.type === "eq") return value === filter.value;
        if (filter.type === "in") return filter.values.includes(value);
        return true;
      }),
    );
  }

  class Builder {
    constructor(table, mode, payload) {
      this.table = table;
      this.mode = mode;
      this.payload = payload;
      this.filters = [];
      this.orders = [];
      this._single = false;
      this._resolve = null;
      this._reject = null;
      this._promise = new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
      queueMicrotask(() => this.execute());
    }

    then(resolve, reject) {
      return this._promise.then(resolve, reject);
    }

    catch(reject) {
      return this._promise.catch(reject);
    }

    eq(column, value) {
      this.filters.push({ type: "eq", column, value });
      return this;
    }

    in(column, values) {
      this.filters.push({ type: "in", column, values: [...values] });
      return this;
    }

    order(column, options = {}) {
      this.orders.push({ column, ascending: options.ascending !== false });
      return this;
    }

    maybeSingle() {
      this._single = true;
      return this;
    }

    async execute() {
      try {
        const tableRows = state[this.table];
        if (!Array.isArray(tableRows)) {
          this._resolve({ data: null, error: { message: `Unknown table ${this.table}` } });
          return;
        }

        if (this.mode === "select") {
          let rows = filterRows(tableRows, this.filters);
          for (const orderSpec of this.orders) {
            rows = [...rows].sort((a, b) => {
              const av = a[orderSpec.column];
              const bv = b[orderSpec.column];
              if (av === bv) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              return orderSpec.ascending ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
            });
          }
          if (this._single) {
            this._resolve({ data: rows[0] || null, error: null });
            return;
          }
          this._resolve({ data: deepClone(rows), error: null });
          return;
        }

        if (this.mode === "update") {
          const rows = filterRows(tableRows, this.filters);
          for (const row of rows) {
            Object.assign(row, deepClone(this.payload));
          }
          this._resolve({ data: null, error: null });
          return;
        }

        if (this.mode === "insert") {
          const rowsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
          for (const incoming of rowsToInsert) {
            const row = deepClone(incoming);
            if (!row.id) {
              row.id = `inserted_${state[this.table].length + 1}`;
            }
            state[this.table].push(row);
          }
          this._resolve({ data: null, error: null });
          return;
        }

        if (this.mode === "delete") {
          const toDelete = new Set(filterRows(tableRows, this.filters).map((row) => row.id));
          state[this.table] = state[this.table].filter((row) => !toDelete.has(row.id));
          this._resolve({ data: null, error: null });
          return;
        }

        this._resolve({ data: null, error: { message: `Unsupported mode ${this.mode}` } });
      } catch (error) {
        this._reject(error);
      }
    }
  }

  return {
    _state: state,
    from(table) {
      return {
        select() {
          return new Builder(table, "select");
        },
        update(payload) {
          return new Builder(table, "update", payload);
        },
        insert(payload) {
          return new Builder(table, "insert", payload);
        },
        delete() {
          return new Builder(table, "delete");
        },
      };
    },
  };
}

function rowById(rows, id) {
  return rows.find((row) => row.id === id) || null;
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const baseBookingId = "booking-1";

function bookingItem(id = "bi-1", quantity = 1) {
  return {
    id,
    booking_id: baseBookingId,
    quantity,
    created_at: "2026-01-01T00:00:00.000Z",
    products: [{ id: "p-1", name: "Generator" }],
  };
}

function reservation(params) {
  return {
    id: params.id,
    booking_id: baseBookingId,
    booking_item_id: params.booking_item_id ?? "bi-1",
    status: params.status ?? "reserved",
    quantity: params.quantity,
    inventory_item_id: params.inventory_item_id ?? "inv-1",
    inventory_unit_id: params.inventory_unit_id ?? null,
    created_at: params.created_at ?? "2026-01-01T00:10:00.000Z",
    inventory_items: [{ id: params.inventory_item_id ?? "inv-1", name: "Generator", sku: "GEN" }],
    inventory_units: params.inventory_unit_id
      ? [{ id: params.inventory_unit_id, unit_code: params.unit_code ?? "GEN-001", serial_number: null }]
      : null,
  };
}

function checklistAuto(params) {
  return {
    id: params.id,
    booking_id: baseBookingId,
    booking_item_id: params.booking_item_id ?? "bi-1",
    inventory_item_id: params.inventory_item_id ?? "inv-1",
    inventory_unit_id: params.inventory_unit_id ?? null,
    title: params.title ?? "Generator",
    item_type: params.item_type ?? "component",
    source: params.source ?? "inventory_reservation",
    quantity: params.quantity ?? 1,
    loaded: params.loaded ?? false,
    installed: params.installed ?? false,
    picked_up: params.picked_up ?? false,
    returned: params.returned ?? false,
    needs_cleaning: params.needs_cleaning ?? false,
    damaged: params.damaged ?? false,
    missing: params.missing ?? false,
    loaded_at: params.loaded_at ?? null,
    installed_at: params.installed_at ?? null,
    picked_up_at: params.picked_up_at ?? null,
    returned_at: params.returned_at ?? null,
    checked_by: params.checked_by ?? null,
    notes: params.notes ?? null,
    sort_order: params.sort_order ?? 100,
    created_at: "2026-01-01T00:20:00.000Z",
    updated_at: "2026-01-01T00:20:00.000Z",
  };
}

const mod = loadOperationalEquipmentModule(modulePath);
const {
  reconcileBookingChecklistFromCurrentState,
  warnOnChecklistReconciliationConflicts,
} = mod;

test("1) existing unchecked row survives fractional quantity conflict", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 0.5 })],
    booking_checklist_items: [
      checklistAuto({ id: "c1", quantity: 1, loaded: false, installed: false }),
    ],
  });

  const result = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.ok(rowById(supabase._state.booking_checklist_items, "c1"));
  assert.equal(rowById(supabase._state.booking_checklist_items, "c1").quantity, 1);
  assert.equal(result.conflicts.some((c) => c.reason === "fractional_quantity"), true);
});

test("2) existing checked row survives fractional quantity conflict", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 0.5 })],
    booking_checklist_items: [
      checklistAuto({ id: "c2", quantity: 1, loaded: true, checked_by: "staff-1" }),
    ],
  });

  await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.ok(rowById(supabase._state.booking_checklist_items, "c2"));
});

test("3) serialized unit conflict preserves row", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [
      reservation({
        id: "r-unit",
        quantity: 0.5,
        inventory_unit_id: "unit-1",
        unit_code: "GEN-U1",
      }),
    ],
    booking_checklist_items: [
      checklistAuto({
        id: "c-unit",
        inventory_unit_id: "unit-1",
        title: "Generator — GEN-U1",
        quantity: 1,
      }),
    ],
  });

  await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.ok(rowById(supabase._state.booking_checklist_items, "c-unit"));
});

test("4) unrelated stale unchecked row can still be removed", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 0.5 })],
    booking_checklist_items: [
      checklistAuto({ id: "c-keep", quantity: 1 }),
      checklistAuto({
        id: "c-stale",
        booking_item_id: "bi-x",
        inventory_item_id: "inv-x",
        quantity: 1,
      }),
    ],
  });

  await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.ok(rowById(supabase._state.booking_checklist_items, "c-keep"));
  assert.equal(rowById(supabase._state.booking_checklist_items, "c-stale"), null);
});

test("5) conflicts are returned to caller", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 0.5 })],
    booking_checklist_items: [checklistAuto({ id: "c1", quantity: 1 })],
  });

  const result = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.ok(Array.isArray(result.conflicts));
  assert.ok(result.conflicts.length > 0);
  assert.equal(result.conflicts[0].reason, "fractional_quantity");
});

test("6) booking edit warning helper logs conflicts and returns warning flag", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const shouldWarn = warnOnChecklistReconciliationConflicts({
      bookingId: baseBookingId,
      conflicts: [
        {
          key: "inventory_reservation:item:bi-1:inv-1",
          reason: "fractional_quantity",
          message: "Unsupported fractional reservation quantity",
        },
      ],
    });

    assert.equal(shouldWarn, true);
    assert.equal(warnings.length, 1);
    assert.equal(String(warnings[0][0]).includes("Checklist reconciliation conflicts after booking edit"), true);
    assert.equal(warnings[0][1].bookingId, baseBookingId);
  } finally {
    console.warn = originalWarn;
  }
});

test("7) normal Generator x1 reconciliation still works", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 1 })],
    booking_checklist_items: [],
  });

  const result = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  const hasGeneratorComponent = supabase._state.booking_checklist_items.some(
    (row) => row.source === "inventory_reservation" && row.title === "Generator" && row.quantity === 1,
  );

  assert.equal(hasGeneratorComponent, true);
  assert.equal(result.conflicts.length, 0);
});

test("8) repeated reconciliation remains idempotent", async () => {
  const supabase = createMockSupabase({
    booking_items: [bookingItem()],
    inventory_reservations: [reservation({ id: "r1", quantity: 1 })],
    booking_checklist_items: [],
  });

  const first = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });
  const second = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId: baseBookingId,
  });

  assert.equal(first.inserted > 0, true);
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.deleted, 0);
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

console.log("All checklist reconciliation behavioral tests passed.");
