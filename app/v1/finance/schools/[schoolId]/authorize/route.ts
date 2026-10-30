import { z } from "zod";
import { authenticateRequest } from "@/platform/session/authenticate";
import { getDatabasePool } from "@/platform/db/pool";
import { assertSchoolFinancePermission, FinanceAccessDenied } from "@/domains/school-finance/authorization";
import type { FinanceAction } from "@/domains/school-finance/permissions";

const actionSchema = z.enum([
  "finance.summary.read", "finance.transactions.read", "finance.transactions.record",
  "finance.reconciliation.prepare", "finance.reconciliation.approve",
  "finance.policy.manage", "finance.expenditure.approve", "finance.audit.read",
]);
const bodySchema = z.object({ action: actionSchema }).strict();
const schoolSchema = z.string().uuid();
type Context = { params: Promise<{ schoolId: string }> };

/** Current-session, current-school permission decision. No client role claims. */
export async function POST(request: Request, context: Context) {
  try {
    const session = await authenticateRequest(request);
    if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const school = schoolSchema.safeParse((await context.params).schoolId);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!school.success || !body.success)
      return Response.json({ error: "INVALID_FINANCE_AUTHORIZATION_REQUEST" }, { status: 400 });
    await assertSchoolFinancePermission(getDatabasePool(), session.personId, school.data, body.data.action as FinanceAction);
    return Response.json(
      { allowed: true, schoolId: school.data, action: body.data.action, personId: session.personId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof FinanceAccessDenied)
      return Response.json({ error: "SCHOOL_FINANCE_FORBIDDEN" }, { status: 403, headers: { "cache-control": "no-store" } });
    return Response.json({ error: "FINANCE_AUTHORITY_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
