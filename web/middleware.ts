import { type NextRequest, NextResponse } from "next/server";

import { refreshAuthSession } from "@/lib/supabase/middleware-client";

const PUBLIC_AUTH_PATHS = ["/login", "/sign-up", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { response, isAuthenticated } = await refreshAuthSession(request);
  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));

  if (!isAuthenticated && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isPublicAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
