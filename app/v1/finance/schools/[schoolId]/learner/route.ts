import { z } from "zod";
import { authenticateRequest } from "@/platform/session/authenticate";
import { getDatabasePool } from "@/platform/db/pool";
import { financeLearner } from "@/domains/school-finance/directory";
import { FinanceAccessDenied } from "@/domains/school-finance/authorization";
const schema = z.object({
  schoolId: z.string().uuid(),
  reference: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
    .transform((v) => v.toUpperCase()),
});
export async function GET(
  request: Request,
  context: { params: Promise<{ schoolId: string }> },
) {
  const headers = { "cache-control": "no-store" };
  try {
    const session = await authenticateRequest(request);
    if (!session)
      return Response.json(
        { error: "UNAUTHENTICATED" },
        { status: 401, headers },
      );
    const parsed = schema.safeParse({
      ...(await context.params),
      reference: new URL(request.url).searchParams.get("reference"),
    });
    if (!parsed.success)
      return Response.json(
        { error: "INVALID_INPUT" },
        { status: 400, headers },
      );
    return Response.json(
      await financeLearner(
        getDatabasePool(),
        session.personId,
        parsed.data.schoolId,
        parsed.data.reference,
      ),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof FinanceAccessDenied
            ? "FINANCE_LEARNER_UNAVAILABLE"
            : "FINANCE_SERVICE_UNAVAILABLE",
      },
      { status: error instanceof FinanceAccessDenied ? 403 : 503, headers },
    );
  }
}
