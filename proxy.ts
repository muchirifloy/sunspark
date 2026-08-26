import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";
import { pathnameHeader } from "@/lib/request-context";

// The current path is forwarded to the app so the root layout can skip the
// storefront chrome on admin routes. See lib/request-context.ts.
export function proxy(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get("sunspark_session")?.value ?? "");
  const { pathname } = request.nextUrl;

  if (session?.role === "ADMIN" && !pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(pathnameHeader, pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|uploads).*)"]
};
