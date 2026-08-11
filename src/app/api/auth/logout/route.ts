import { accessTokenFromRequest, clearSessionCookies, supabaseAuth } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  const token = accessTokenFromRequest(request);
  if (token) {
    try { await supabaseAuth("/logout?scope=local", { method: "POST" }, token); } catch {}
  }
  return clearSessionCookies(Response.json({ ok: true }));
}
