import { adminRequest } from "@/domains/school-admin/http";
import { revokeInvitation, schoolIdSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";

export async function DELETE(request: Request, context: { params: Promise<{ schoolId: string; invitationId: string }> }) {
  return adminRequest(request, async session => {
    const params = await context.params;
    return revokeInvitation(getDatabasePool(), session.personId, schoolIdSchema.parse(params.schoolId), schoolIdSchema.parse(params.invitationId));
  });
}
