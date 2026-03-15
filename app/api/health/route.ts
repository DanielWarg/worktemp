export async function GET() {
  return Response.json({
    ok: true,
    service: "monster",
    timestamp: new Date().toISOString(),
  });
}
