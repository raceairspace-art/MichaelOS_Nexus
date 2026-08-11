import { authenticateRequest, unauthorized } from "@/lib/nexus-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return unauthorized();
  return Response.json({ ok: true, bypass: auth.bypass, user: auth.user ? { id: auth.user.id, email: auth.user.email ?? null } : null });
}
