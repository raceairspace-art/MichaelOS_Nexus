import { clearSessionCookies, setSessionCookies, supabaseAuth, verifyAccessToken } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return Response.json({ error: "Email and password are required." }, { status: 400 });

    const upstream = await supabaseAuth("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok || !data?.access_token) {
      return Response.json({ error: "Sign-in failed." }, { status: 401 });
    }

    const user = await verifyAccessToken(data.access_token);
    if (!user) {
      const rejected = Response.json({ error: "This account is not authorized for MichaelOS Nexus." }, { status: 403 });
      return clearSessionCookies(rejected);
    }

    return setSessionCookies(Response.json({ ok: true, user: { id: user.id, email: user.email ?? null } }), data);
  } catch (error) {
    console.error("Nexus login failed", error);
    return Response.json({ error: "Sign-in failed." }, { status: 500 });
  }
}
