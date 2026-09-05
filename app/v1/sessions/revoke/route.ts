import { recordAuditEvent } from "../../../../platform/audit/service";
import { getDatabasePool } from "../../../../platform/db/pool";
import { readBearerToken, revokeBearerSession } from "../../../../platform/session/service";

export async function POST(request: Request): Promise<Response> {
  const token = readBearerToken(request);
  if (!token) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const pool = getDatabasePool();
  const revoked = await revokeBearerSession(pool, token);
  if (!revoked) return Response.json({ revoked: false });

  await recordAuditEvent(pool, {
    actorPersonId: revoked.personId,
    action: "SESSION_REVOKE",
    resourceType: "SESSION",
    resourceId: revoked.sessionId,
    decision: "ALLOW",
    reason: "session_revoked",
  });

  return Response.json({ revoked: true });
}
