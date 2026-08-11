import { supabaseAuth } from "@/lib/nexus-auth";

export async function POST() {
  try {
    const upstream = await supabaseAuth("/passkeys/authentication/options", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const text = await upstream.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!upstream.ok) {
      return Response.json({ error: data?.msg || data?.message || data?.error_description || "Passkey sign-in is not enabled for this site yet." }, { status: upstream.status });
    }
    return Response.json(data);
  } catch (error) {
    console.error("Passkey options failed", error);
    return Response.json({ error: "Passkey sign-in is unavailable." }, { status: 500 });
  }
}
