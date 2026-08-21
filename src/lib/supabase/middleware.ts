import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/access";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );

    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              response.cookies.set(name, value, options);
            },
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isAdminRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  const isAccountRoute =
    pathname === "/account" ||
    pathname.startsWith("/account/");

  const isStaffLoginRoute = pathname === "/login";

  const isCustomerLoginRoute =
    pathname === "/account/login";
  const isDriverRoute = pathname === "/driver" || pathname.startsWith("/driver/");

  if ((isAdminRoute || isAccountRoute || isDriverRoute) && !user) {
    const loginUrl = request.nextUrl.clone();

    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`) || "/admin",
    );

    return NextResponse.redirect(loginUrl);
  }

  /*
   * Пока не перенаправляем авторизованного пользователя
   * с login-страниц автоматически.
   *
   * Сотрудник и клиент будут иметь разные landing pages,
   * поэтому роль должна проверяться соответствующим layout.
   */
  if (isStaffLoginRoute || isCustomerLoginRoute) {
    return response;
  }

  return response;
}