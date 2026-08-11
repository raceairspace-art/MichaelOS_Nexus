import { clearSessionCookies, setSessionCookies, supabaseAuth, verifyAccessToken } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.challenge_id || !body?.credential) return Response.json({ error: "Incomplete passkey response." }, { status: 400 });
    const upstream = await supabaseAuth("/passkeys/authentication/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: body.challenge_id, credential: body.credential }),
    });
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok || !data?.access_token) {
      return Response.json({ error: data?.msg || data?.message || data?.error_description || "Passkey verification failed." }, { status: upstream.status || 401 });
    }
    const user = await verifyAccessToken(data.access_token);
    if (!user) return clearSessionCookies(Response.json({ error: "This passkey is not authorized for MichaelOS Nexus." }, { status: 403 }));
    return setSessionCookies(Response.json({ ok: true }), data);
  } catch (error) {
    console.error("Passkey verification failed", error);
    return Response.json({ error: "Passkey verification failed." }, { status: 500 });
  }
}
