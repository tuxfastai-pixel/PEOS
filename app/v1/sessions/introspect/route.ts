import { getDatabasePool } from "../../../../platform/db/pool";
import { introspectBearerSession, readBearerToken } from "../../../../platform/session/service";

export async function POST(request: Request): Promise<Response> {
  const token = readBearerToken(request);
  if (!token) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const session = await introspectBearerSession(getDatabasePool(), token);
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  return Response.json({ session });
}
