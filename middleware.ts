import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Preserve exact legacy URLs that cannot safely be represented in
  // next.config.js because redirect matching there is case-insensitive.
  let decodedPathname = request.nextUrl.pathname;
  try {
    decodedPathname = decodeURIComponent(decodedPathname);
  } catch {
    // Keep the original pathname for malformed escape sequences.
  }

  if (decodedPathname === "/сasablanca") {
    return NextResponse.redirect(
      new URL("/product/casa-blanca", request.url),
      308,
    );
  }

  if (decodedPathname === "/privacypolicy") {
    return NextResponse.redirect(
      new URL("/PrivacyPolicy", request.url),
      308,
    );
  }

  const response = await updateSession(request);

  if (process.env.NODE_ENV !== "production") {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
