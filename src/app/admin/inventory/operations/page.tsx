import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export default async function WarehouseOperationsPage() {
  const { supabase } = await requireAdminPermission("inventory.view");

  // Get recent movements and operations
  const [
    recentMovementsResult,
    itemsAtRiskResult,
    locationStatsResult,
  ] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select(
        `
        id,
        movement_type,
        quantity,
        created_at,
        inventory_items (id, name, sku),
        inventory_units (unit_code)
      `
      )
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("inventory_items")
      .select(
        `
        id, name, sku, tracking_type, quantity_available,
        reorder_point, inventory_units (status)
      `
      )
      .neq("active", false)
      .order("created_at", { ascending: true })
      .limit(20),

    supabase
      .from("warehouse_locations")
      .select(
        `
        id, name, location_type,
        inventory_units (status)
      `
      )
      .eq("active", true),
  ]);

  const recentMovements = recentMovementsResult.data || [];
  const itemsAtRisk = itemsAtRiskResult.data || [];
  const locations = locationStatsResult.data || [];

  function formatMovementType(type: string) {
    const map: Record<string, string> = {
      "receive": "📥 Receive",
      "return": "🔙 Return",
      "send_to_cleaning": "🧹 Cleaning",
      "send_to_maintenance": "🔧 Maintenance",
      "transfer": "↔️ Transfer",
      "write_off": "❌ Write-off",
      "rental_reserve": "🎪 Reserve",
      "rental_return": "🎪 Return from rental",
    };
    return map[type] || type;
  }

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      {/* Header */}
      <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
          Inventory Management
        </div>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:mt-2 sm:text-4xl sm:font-semibold">
          Warehouse Operations
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-5 text-[#6c6258] sm:mt-3 sm:text-base sm:leading-6">
          Управление приёмом товара, возвратами и складскими операциями. Выбирайте нужную операцию или смотрите историю.
        </p>
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/inventory/receive">
          <div className="group h-full rounded-[18px] border border-[#c9964f] bg-gradient-to-br from-[#faf8f5] to-white p-3.5 transition hover:shadow-lg sm:rounded-[24px] sm:border-2 sm:p-6">
            <div className="text-2xl sm:text-3xl">📥</div>
            <h3 className="mt-2 text-sm font-bold leading-5 text-[#1f1e1b] sm:mt-3 sm:text-base sm:font-semibold">Receive Stock</h3>
            <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
              Приём нового товара от поставщика или с восстановления
            </p>
          </div>
        </Link>

        <Link href="/admin/inventory/returns">
          <div className="group h-full rounded-[18px] border border-[#4a9d83] bg-gradient-to-br from-[#f0faf7] to-white p-3.5 transition hover:shadow-lg sm:rounded-[24px] sm:border-2 sm:p-6">
            <div className="text-2xl sm:text-3xl">🔙</div>
            <h3 className="mt-2 text-sm font-bold leading-5 text-[#1f1e1b] sm:mt-3 sm:text-base sm:font-semibold">Process Returns</h3>
            <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
              Приём товара обратно после события или возврата клиента
            </p>
          </div>
        </Link>

        <Link href="/admin/inventory/write-offs">
          <div className="group h-full rounded-[18px] border border-[#d97706] bg-gradient-to-br from-[#fef3f0] to-white p-3.5 transition hover:shadow-lg sm:rounded-[24px] sm:border-2 sm:p-6">
            <div className="text-2xl sm:text-3xl">❌</div>
            <h3 className="mt-2 text-sm font-bold leading-5 text-[#1f1e1b] sm:mt-3 sm:text-base sm:font-semibold">Write-off</h3>
            <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
              Списание повреждённого, потерянного или устаревшего товара
            </p>
          </div>
        </Link>

        <Link href="/admin/inventory/movements">
          <div className="group h-full rounded-[18px] border border-[#6b7280] bg-gradient-to-br from-[#f3f4f6] to-white p-3.5 transition hover:shadow-lg sm:rounded-[24px] sm:border-2 sm:p-6">
            <div className="text-2xl sm:text-3xl">📊</div>
            <h3 className="mt-2 text-sm font-bold leading-5 text-[#1f1e1b] sm:mt-3 sm:text-base sm:font-semibold">History</h3>
            <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
              Полный логи всех операций и перемещений товара
            </p>
          </div>
        </Link>
      </section>

      {/* Main Content Grid */}
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Items at Risk */}
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">⚠️ Items at Risk</h3>
            <p className="mt-1 text-sm text-[#6c6258]">
              Товар требующий внимания
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {itemsAtRisk.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#9a723e]">
                Всё хорошо! Нет проблемных товаров.
              </div>
            ) : (
              itemsAtRisk.map((item: any) => {
                const units = item.inventory_units || [];
                const dirtyCount = units.filter((u: any) => u.status === "cleaning").length;
                const brokenCount = units.filter((u: any) => u.status === "damaged").length;

                if (dirtyCount === 0 && brokenCount === 0) return null;

                return (
                  <Link
                    key={item.id}
                    href={`/admin/inventory/items/${item.id}`}
                    className="block px-3.5 py-3 transition hover:bg-[#faf8f5] sm:px-6 sm:py-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-[#1f1e1b]">
                          {item.name}
                        </div>
                        <div className="text-xs text-[#9a723e]">{item.sku}</div>
                      </div>
                      <div className="text-right">
                        {dirtyCount > 0 && (
                          <div className="text-xs font-semibold text-[#8a6b20]">
                            🧹 {dirtyCount}
                          </div>
                        )}
                        {brokenCount > 0 && (
                          <div className="text-xs font-semibold text-red-700">
                            🚫 {brokenCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        {/* Location Summary */}
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">📍 Locations</h3>
            <p className="mt-1 text-sm text-[#6c6258]">
              Распределение по локациям
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {locations.map((location: any) => {
              const units = location.inventory_units || [];
              const available = units.filter((u: any) => u.status === "available").length;
              const total = units.length;

              return (
                <div key={location.id} className="px-3.5 py-3 sm:px-6 sm:py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#1f1e1b]">
                        {location.name}
                      </div>
                      <div className="text-xs text-[#9a723e]">
                        {location.location_type || "Warehouse"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        {available}/{total}
                      </div>
                      <div className="text-xs text-[#6c6258]">available</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-2 w-full rounded-full bg-[#eee5d9]">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition"
                      style={{
                        width: total === 0 ? "0%" : `${(available / total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">📝 Recent</h3>
            <p className="mt-1 text-sm text-[#6c6258]">
              Последние операции
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {recentMovements.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#9a723e]">
                Операций еще нет
              </div>
            ) : (
              recentMovements.map((movement: any) => (
                <div key={movement.id} className="px-3.5 py-2.5 sm:px-6 sm:py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        {formatMovementType(movement.movement_type)}
                      </div>
                      <div className="text-xs text-[#6c6258] truncate">
                        {movement.inventory_items?.name ||
                          movement.inventory_units?.unit_code ||
                          "Unknown"}
                      </div>
                    </div>
                    <div className="text-xs text-[#9a723e] whitespace-nowrap">
                      {new Date(movement.created_at).toLocaleDateString("ru-RU", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:px-6">
            <Link
              href="/admin/inventory/movements"
              className="text-sm font-semibold text-[#c9964f] hover:text-[#b78744]"
            >
              See all →
            </Link>
          </div>
        </section>
      </div>

      {/* Advanced Operations */}
      <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-lg font-semibold text-[#1f1e1b]">Advanced</h3>
          <p className="mt-1 text-sm text-[#6c6258]">
            Системные операции для опытных пользователей
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3.5 sm:gap-3 sm:p-6 md:grid-cols-3">
          <Link
            href="/admin/inventory/supplies"
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 py-2.5 text-center text-[11px] font-bold leading-4 text-[#2b2a28] transition hover:bg-[#faf8f5] sm:px-4 sm:py-3 sm:text-sm sm:font-semibold"
          >
            📦 Supply Documents
          </Link>

          <Link
            href="/admin/inventory/items"
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 py-2.5 text-center text-[11px] font-bold leading-4 text-[#2b2a28] transition hover:bg-[#faf8f5] sm:px-4 sm:py-3 sm:text-sm sm:font-semibold"
          >
            🏷️ All Items
          </Link>

          <Link
            href="/admin/inventory"
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 py-2.5 text-center text-[11px] font-bold leading-4 text-[#2b2a28] transition hover:bg-[#faf8f5] sm:px-4 sm:py-3 sm:text-sm sm:font-semibold"
          >
            📊 Inventory View
          </Link>
        </div>
      </section>
    </div>
  );
}
