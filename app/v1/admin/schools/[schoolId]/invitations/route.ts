import { adminRequest } from "@/domains/school-admin/http";
import { createInvitation, invitationSchema, listInvitations, schoolIdSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  return adminRequest(request, async session => ({ invitations: await listInvitations(getDatabasePool(), session.personId, schoolIdSchema.parse((await context.params).schoolId)) }));
}
export async function POST(request: Request, context: Context) {
  return adminRequest(request, async session => {
    const schoolId = schoolIdSchema.parse((await context.params).schoolId);
    const input = invitationSchema.parse(await request.json().catch(() => null));
    return createInvitation(getDatabasePool(), session.personId, schoolId, input);
  }, 201);
}
