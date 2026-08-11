import { clearSessionCookies, refreshTokenFromRequest, setSessionCookies, supabaseAuth, verifyAccessToken } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  const refreshToken = refreshTokenFromRequest(request);
  if (!refreshToken) return clearSessionCookies(Response.json({ error: "No refresh session." }, { status: 401 }));
  try {
    const upstream = await supabaseAuth("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok || !data?.access_token) return clearSessionCookies(Response.json({ error: "Session expired." }, { status: 401 }));
    const user = await verifyAccessToken(data.access_token);
    if (!user) return clearSessionCookies(Response.json({ error: "Session is not authorized." }, { status: 403 }));
    return setSessionCookies(Response.json({ ok: true }), data);
  } catch (error) {
    console.error("Nexus session refresh failed", error);
    return clearSessionCookies(Response.json({ error: "Session refresh failed." }, { status: 500 }));
  }
}
