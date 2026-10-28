import { adminRequest } from "@/domains/school-admin/http";
import { schoolIdSchema } from "@/domains/school-admin/service";
import { getSchoolProfile, saveSchoolProfile, schoolProfileSchema } from "@/domains/school-admin/schoolProfile";
import { getDatabasePool } from "@/platform/db/pool";
type Context = { params: Promise<{ schoolId: string }> };
export async function GET(request: Request, context: Context) {
  return adminRequest(request, async session => ({ profile: await getSchoolProfile(getDatabasePool(), session.personId, schoolIdSchema.parse((await context.params).schoolId)) }));
}
export async function PUT(request: Request, context: Context) {
  return adminRequest(request, async session => ({ profile: await saveSchoolProfile(getDatabasePool(), session.personId, schoolIdSchema.parse((await context.params).schoolId), schoolProfileSchema.parse(await request.json().catch(() => null))) }));
}
