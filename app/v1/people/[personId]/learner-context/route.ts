import { getLearnerContext, teacherCanAccessLearner } from "../../../../../domains/learner/context";
import { getDatabasePool } from "../../../../../platform/db/pool";
import { authenticateRequest } from "../../../../../platform/session/authenticate";

export async function GET(
  request: Request,
  context: { params: Promise<{ personId: string }> },
): Promise<Response> {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { personId } = await context.params;
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  if (!schoolId) return Response.json({ error: "SCHOOL_ID_REQUIRED" }, { status: 400 });

  const pool = getDatabasePool();
  const allowed = await teacherCanAccessLearner(pool, session.personId, personId, schoolId);
  if (!allowed) return Response.json({ error: "FORBIDDEN" }, { status: 403 });

  const learner = await getLearnerContext(pool, personId, schoolId);
  if (!learner) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  return Response.json(learner);
}
