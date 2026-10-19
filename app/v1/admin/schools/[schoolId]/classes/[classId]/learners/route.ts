import {adminRequest} from "@/domains/school-admin/http";
import {classRoster,enrolLearners,learnerBatchSchema,rosterQuerySchema} from "@/domains/school-admin/learners";
import {schoolIdSchema} from "@/domains/school-admin/service";
import {getDatabasePool} from "@/platform/db/pool";
export const maxDuration=60;
type Context={params:Promise<{schoolId:string;classId:string}>};
export async function GET(request:Request,context:Context){return adminRequest(request,async session=>{
 const p=await context.params;const query=rosterQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 return classRoster(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),query.offset);
});}
export async function POST(request:Request,context:Context){return adminRequest(request,async session=>{
 const p=await context.params;return enrolLearners(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),learnerBatchSchema.parse(await request.json().catch(()=>null)));
});}
