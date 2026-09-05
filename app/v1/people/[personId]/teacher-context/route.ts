import { getTeacherContext } from "../../../../../domains/teacher/context";
import { getDatabasePool } from "../../../../../platform/db/pool";
import { authenticateRequest } from "../../../../../platform/session/authenticate";

export async function GET(
  request: Request,
  context: { params: Promise<{ personId: string }> },
): Promise<Response> {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { personId } = await context.params;
  if (session.personId !== personId) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const teacher = await getTeacherContext(getDatabasePool(), personId);
  if (!teacher) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  return Response.json(teacher);
}
