import { ZodError } from "zod";
import { authenticateRequest } from "../../platform/session/authenticate";
import type { IntrospectedSession } from "../../platform/session/service";
import { AdminError } from "./service";
import { recordAuditEvent } from "../../platform/audit/service";
import { getDatabasePool } from "../../platform/db/pool";

export async function adminRequest(request: Request, action: (session: IntrospectedSession) => Promise<unknown>, status = 200, auditKind = {action:"school_admin.request",resourceType:"SchoolAdministration"}) {
  let actorPersonId: string | undefined;
  try {
    const session = await authenticateRequest(request);
    if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    actorPersonId = session.personId;
    return Response.json(await action(session), { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AdminError) {
      if (actorPersonId) {
        try {
          await recordAuditEvent(getDatabasePool(), { actorPersonId, action: auditKind.action, resourceType: auditKind.resourceType,
            resourceId: new URL(request.url).pathname, decision: "DENY", reason: error.code });
        } catch { return Response.json({ error: "AUDIT_UNAVAILABLE" }, { status: 503 }); }
      }
      return Response.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof ZodError) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    return Response.json({ error: "ADMIN_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
