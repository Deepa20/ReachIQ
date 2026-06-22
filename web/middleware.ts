import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_AUTH_PATHS = ["/login", "/sign-up", "/reset-password"];

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const { response, isAuthenticated } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));
  response.headers.set("x-request-id", requestId);

  if (!isAuthenticated && pathname.startsWith("/dashboard")) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  }

  if (isAuthenticated && isPublicAuthRoute) {
    const redirect = NextResponse.redirect(new URL("/dashboard", request.url));
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
