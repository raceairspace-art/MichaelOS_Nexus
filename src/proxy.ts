import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_COOKIE = "michaelos_nexus_access";
const publicPaths = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/passkey/options",
  "/api/auth/passkey/verify",
]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.has(path)) return NextResponse.next();

  const expectedBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const bypass = Boolean(expectedBypass) && request.headers.get("x-vercel-protection-bypass") === expectedBypass;
  const hasAccessCookie = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  if (bypass || hasAccessCookie) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
