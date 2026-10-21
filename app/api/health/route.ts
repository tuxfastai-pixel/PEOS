export async function GET(): Promise<Response> {
  return Response.json({ service: "peos", status: "ok" });
}
