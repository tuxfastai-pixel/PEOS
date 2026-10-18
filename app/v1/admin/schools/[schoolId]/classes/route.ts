import { adminRequest } from "@/domains/school-admin/http";
import { classDirectory, classInputSchema, createSchoolClass } from "@/domains/school-admin/classes";
import { schoolIdSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";
type Context={params:Promise<{schoolId:string}>};
export async function GET(request:Request,context:Context){
  return adminRequest(request,async session=>classDirectory(getDatabasePool(),session.personId,schoolIdSchema.parse((await context.params).schoolId)));
}
export async function POST(request:Request,context:Context){
  return adminRequest(request,async session=>({class:await createSchoolClass(getDatabasePool(),session.personId,
    schoolIdSchema.parse((await context.params).schoolId),classInputSchema.parse(await request.json().catch(()=>null)))}),201);
}
