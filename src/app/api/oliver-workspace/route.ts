import { getWorkspaceState, oliverStoreConfigured, putModelVersion, putWorkspaceState } from "@/lib/oliver-store";

export async function GET() {
  if (!oliverStoreConfigured()) return Response.json({ configured: false, state: null });
  try {
    const row = await getWorkspaceState();
    return Response.json({ configured: true, state: row?.state ?? null, updatedAt: row?.updated_at ?? null });
  } catch (error) {
    console.error("Oliver workspace load failed", error);
    return Response.json({ error: "Could not load permanent Oliver workspace state." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !body.state) return Response.json({ error: "Missing workspace state." }, { status: 400 });
    if (!oliverStoreConfigured()) return Response.json({ configured: false, saved: false });
    await putWorkspaceState("digital-oliver", body.state);
    const settings = body.state?.modelSettings;
    if (settings?.version) await putModelVersion(settings.version, settings);
    return Response.json({ configured: true, saved: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Oliver workspace save failed", error);
    return Response.json({ error: "Could not save permanent Oliver workspace state." }, { status: 500 });
  }
}
