import { adminRequest } from "@/domains/school-admin/http";
import { renameSchool, schoolIdSchema, schoolNameSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";

export async function PATCH(request: Request, context: { params: Promise<{ schoolId: string }> }) {
  return adminRequest(request, async session => {
    const schoolId = schoolIdSchema.parse((await context.params).schoolId);
    const input = schoolNameSchema.parse(await request.json().catch(() => null));
    return { school: await renameSchool(getDatabasePool(), session.personId, schoolId, input.displayName) };
  });
}
