export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, service: "friday-hud", time: new Date().toISOString() });
}
