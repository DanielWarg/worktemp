export async function GET() {
  return Response.json({
    ok: true,
    service: "worktemp-web",
    timestamp: new Date().toISOString(),
  });
}
