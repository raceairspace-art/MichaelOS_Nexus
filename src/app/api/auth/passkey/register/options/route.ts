import { accessTokenFromRequest, authenticateRequest, supabaseAuth, unauthorized } from "@/lib/nexus-auth";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok || auth.bypass) return unauthorized();
  const token = accessTokenFromRequest(request);
  try {
    const upstream = await supabaseAuth("/passkeys/registration/options", {
      method: "POST",
      body: JSON.stringify({}),
    }, token);
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok) {
      return Response.json({ error: data?.msg || data?.message || data?.error_description || "Passkey registration is not enabled for this site yet." }, { status: upstream.status });
    }
    return Response.json(data);
  } catch (error) {
    console.error("Passkey registration options failed", error);
    return Response.json({ error: "Passkey registration is unavailable." }, { status: 500 });
  }
}
