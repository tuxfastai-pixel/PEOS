import { getTeacherContext } from "../../../../../domains/teacher/context";
import { recordAuditEvent } from "../../../../../platform/audit/service";
import { getDatabasePool } from "../../../../../platform/db/pool";
import { authenticateRequest } from "../../../../../platform/session/authenticate";

export async function GET(
  request: Request,
  context: { params: Promise<{ personId: string }> },
): Promise<Response> {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { personId } = await context.params;
  const pool = getDatabasePool();

  if (session.personId !== personId) {
    await recordAuditEvent(pool, {
      actorPersonId: session.personId,
      action: "teacher_context.read",
      resourceType: "Person",
      resourceId: personId,
      decision: "DENY",
      reason: "self_scope_required",
    });
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const teacher = await getTeacherContext(pool, personId);
  if (!teacher) {
    await recordAuditEvent(pool, {
      actorPersonId: session.personId,
      action: "teacher_context.read",
      resourceType: "Person",
      resourceId: personId,
      decision: "DENY",
      reason: "active_teacher_context_not_found",
    });
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await recordAuditEvent(pool, {
    actorPersonId: session.personId,
    action: "teacher_context.read",
    resourceType: "Person",
    resourceId: personId,
    decision: "ALLOW",
    reason: "active_self_teacher_context",
    metadata: { schoolId: teacher.schoolId },
  });

  return Response.json(teacher);
}
