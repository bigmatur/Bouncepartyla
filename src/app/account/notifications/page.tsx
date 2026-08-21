import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { saveNotificationPreferencesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  const customerResult = await supabase
    .from("customers")
    .select("id,email,phone")
    .eq("auth_user_id", access.user?.id || "")
    .limit(1)
    .maybeSingle();
  if (customerResult.error) throw new Error(customerResult.error.message);

  const [categoriesResult, prefsResult, inAppResult, smsSuppressionResult] = await Promise.all([
    supabase.from("notification_categories").select("code,label,description,customer_configurable,mandatory,allow_email,allow_sms,allow_in_app,sort_order").eq("active", true).order("sort_order"),
    customerResult.data?.id
      ? supabase.from("notification_preferences").select("category_code,email_enabled,sms_enabled,in_app_enabled").eq("customer_id", customerResult.data.id)
      : Promise.resolve({ data: [], error: null }),
    customerResult.data?.id
      ? supabase.from("notification_deliveries").select("id,event_code,subject,rendered_body,booking_id,status,created_at,delivered_at").eq("customer_id", customerResult.data.id).eq("channel", "in_app").in("status", ["sent","delivered"]).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    customerResult.data?.id
      ? supabase.from("notification_sms_suppressions").select("phone_key,keyword,suppressed_at").eq("customer_id", customerResult.data.id).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (prefsResult.error) throw new Error(prefsResult.error.message);
  if (inAppResult.error) throw new Error(inAppResult.error.message);
  if (smsSuppressionResult.error) throw new Error(smsSuppressionResult.error.message);

  const preferenceMap = new Map((prefsResult.data || []).map((item: any) => [item.category_code, item]));
  const editable = access.role === "customer" && !canPreviewCustomer && Boolean(customerResult.data?.id);

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,.05)] sm:rounded-[30px] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-black/40">Notifications</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:mt-3 sm:text-4xl">Notification preferences</h1>
          <p className="mt-2 text-sm leading-5 text-black/55 sm:mt-3 sm:max-w-3xl sm:leading-6 sm:text-black/60">Choose how we contact you. Required account and booking messages stay enabled.</p>

          {params.saved === "1" ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Notification preferences updated.</div> : null}
          {params.error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{params.error}</div> : null}

          {smsSuppressionResult.data ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><div className="font-semibold">SMS messages are currently stopped for this phone number.</div><div className="mt-1 text-xs leading-5">This number replied {smsSuppressionResult.data.keyword || "STOP"}. Reply START to the Bounce Party LA SMS number to remove the carrier-level opt-out. Your category preferences below will continue to apply.</div></div> : null}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:mt-5 sm:gap-3 sm:text-sm">
            <div className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4"><div className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">Email</div><div className="mt-1 font-semibold">{customerResult.data?.email || access.user?.email || "Not linked"}</div></div>
            <div className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4"><div className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">SMS</div><div className="mt-1 font-semibold">{customerResult.data?.phone || "No phone number"}</div></div>
          </div>

          <form action={saveNotificationPreferencesAction} className="mt-5 space-y-3 sm:mt-7 sm:space-y-4">
            {(categoriesResult.data || []).map((category) => {
              const pref: any = preferenceMap.get(category.code);
              const mandatory = category.mandatory || !category.customer_configurable;
              return (
                <div key={category.code} className="rounded-[18px] border border-black/8 bg-[#fbf9f6] p-4 sm:rounded-[24px] sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-semibold">{category.label}</div><div className="mt-1 hidden max-w-2xl text-sm text-black/50 sm:block">{category.description}</div></div>
                    {mandatory ? <span className="rounded-full bg-black/[.06] px-3 py-1 text-xs font-semibold">Required</span> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:flex sm:flex-wrap sm:gap-3">
                    {category.allow_email ? <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 py-2 text-xs font-semibold sm:min-h-0 sm:justify-start sm:px-3 sm:text-sm"><input type="checkbox" name={`${category.code}:email`} defaultChecked={mandatory ? true : pref?.email_enabled ?? true} disabled={!editable || mandatory} /> Email</label> : null}
                    {category.allow_sms ? <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 py-2 text-xs font-semibold sm:min-h-0 sm:justify-start sm:px-3 sm:text-sm"><input type="checkbox" name={`${category.code}:sms`} defaultChecked={mandatory ? true : pref?.sms_enabled ?? true} disabled={!editable || mandatory} /> SMS</label> : null}
                    {category.allow_in_app ? <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 py-2 text-xs font-semibold sm:min-h-0 sm:justify-start sm:px-3 sm:text-sm"><input type="checkbox" name={`${category.code}:in_app`} defaultChecked={mandatory ? true : pref?.in_app_enabled ?? true} disabled={!editable || mandatory} /> In-app</label> : null}
                  </div>
                </div>
              );
            })}
            <button disabled={!editable} className="sticky bottom-3 z-10 w-full rounded-full bg-[#1d1d1b] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,.18)] disabled:cursor-not-allowed disabled:opacity-50 sm:static sm:w-auto sm:py-3 sm:shadow-none">Save preferences</button>
          </form>


          <div className="mt-7 border-t border-black/8 pt-5 sm:mt-10 sm:pt-7">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold sm:text-xl">Recent notifications</div>
                <p className="mt-1 hidden text-sm text-black/50 sm:block">Important booking, payment and contract updates sent to your account.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {(inAppResult.data || []).map((item: any) => (
                <a key={item.id} href={item.booking_id ? `/account/bookings/${item.booking_id}` : "/account"} className="block rounded-[16px] border border-black/8 bg-[#fbf9f6] p-3 transition hover:bg-[#f7f3ed] sm:rounded-2xl sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-semibold">{item.subject || item.event_code}</div>
                    <div className="text-xs text-black/40">{new Date(item.delivered_at || item.created_at).toLocaleString("en-US")}</div>
                  </div>
                  {item.rendered_body ? <div className="mt-1 text-sm text-black/55">{item.rendered_body}</div> : null}
                </a>
              ))}
              {!(inAppResult.data || []).length ? <div className="rounded-2xl bg-[#f7f4ef] p-5 text-sm text-black/45">No notifications yet.</div> : null}
            </div>
          </div>
        </section>
      </main>
    </CustomerShell>
  );
}
