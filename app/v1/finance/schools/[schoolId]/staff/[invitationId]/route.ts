import { z } from "zod";
import { adminRequest } from "@/domains/school-admin/http";
import { revokeFinanceStaff } from "@/domains/school-finance/directory";
import { getDatabasePool } from "@/platform/db/pool";
import { FinanceAccessDenied } from "@/domains/school-finance/authorization";
import { AdminError } from "@/domains/school-admin/service";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ schoolId: string; invitationId: string }> },
) {
  try {
    return await adminRequest(request, async (session) => {
      const params = z
        .object({
          schoolId: z.string().uuid(),
          invitationId: z.string().uuid(),
        })
        .parse(await context.params);
      return revokeFinanceStaff(
        getDatabasePool(),
        session.personId,
        params.schoolId,
        params.invitationId,
      );
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof FinanceAccessDenied || (error instanceof AdminError && error.status === 403)
            ? "FINANCE_FORBIDDEN"
            : "FINANCE_SERVICE_UNAVAILABLE",
      },
      {
        status: error instanceof FinanceAccessDenied || (error instanceof AdminError && error.status === 403) ? 403 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
