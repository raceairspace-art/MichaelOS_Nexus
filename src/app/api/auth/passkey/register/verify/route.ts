import { accessTokenFromRequest, authenticateRequest, supabaseAuth, unauthorized } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok || auth.bypass) return unauthorized();
  const token = accessTokenFromRequest(request);
  try {
    const body = await request.json();
    if (!body?.challenge_id || !body?.credential) return Response.json({ error: "Incomplete passkey registration response." }, { status: 400 });
    const upstream = await supabaseAuth("/passkeys/registration/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: body.challenge_id, credential: body.credential }),
    }, token);
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok) {
      return Response.json({ error: data?.msg || data?.message || data?.error_description || "Passkey registration failed." }, { status: upstream.status });
    }
    return Response.json({ ok: true, passkey: data });
  } catch (error) {
    console.error("Passkey registration failed", error);
    return Response.json({ error: "Passkey registration failed." }, { status: 500 });
  }
}
