export const SUPABASE_URL = process.env.SUPABASE_URL || "https://mutgmifeyabrbjjmjfoq.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_2Q0OFkqsDdxSwrx3NIneYg_QX4V3152";
export const NEXUS_ALLOWED_USER_ID = process.env.NEXUS_ALLOWED_USER_ID || "e1be1dc8-0745-482f-9c2f-d425f69ddf34";
export const ACCESS_COOKIE = "michaelos_nexus_access";
export const REFRESH_COOKIE = "michaelos_nexus_refresh";

type SupabaseUser = { id?: string; email?: string | null; [key: string]: unknown };
type SessionPayload = { access_token?: string; refresh_token?: string; expires_in?: number; user?: SupabaseUser; [key: string]: unknown };

function cookieFromHeader(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function accessTokenFromRequest(request: Request) { return cookieFromHeader(request, ACCESS_COOKIE); }
export function refreshTokenFromRequest(request: Request) { return cookieFromHeader(request, REFRESH_COOKIE); }

export function automationBypassAuthorized(request: Request) {
  const expected = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!expected) return false;
  return request.headers.get("x-michaelos-automation-bypass") === expected || request.headers.get("x-vercel-protection-bypass") === expected;
}

export async function verifyAccessToken(token: string): Promise<SupabaseUser | null> {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = await response.json() as SupabaseUser;
    if (user.id !== NEXUS_ALLOWED_USER_ID) return null;
    return user;
  } catch { return null; }
}

export async function authenticateRequest(request: Request) {
  if (automationBypassAuthorized(request)) return { ok: true as const, bypass: true as const, user: null };
  const user = await verifyAccessToken(accessTokenFromRequest(request));
  if (!user) return { ok: false as const, bypass: false as const, user: null };
  return { ok: true as const, bypass: false as const, user };
}

export function unauthorized() { return Response.json({ error: "Authentication required." }, { status: 401 }); }
function serializeCookie(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure}`;
}
export function setSessionCookies(response: Response, session: SessionPayload) {
  if (!session.access_token || !session.refresh_token) return response;
  response.headers.append("Set-Cookie", serializeCookie(ACCESS_COOKIE, session.access_token, Math.max(60, Number(session.expires_in || 3600) - 30)));
  response.headers.append("Set-Cookie", serializeCookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
  return response;
}
export function clearSessionCookies(response: Response) {
  response.headers.append("Set-Cookie", serializeCookie(ACCESS_COOKIE, "", 0));
  response.headers.append("Set-Cookie", serializeCookie(REFRESH_COOKIE, "", 0));
  return response;
}
export async function supabaseAuth(path: string, init: RequestInit = {}, accessToken?: string) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${SUPABASE_URL}/auth/v1${path}`, { ...init, headers, cache: "no-store" });
}
