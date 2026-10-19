import {adminRequest} from "@/domains/school-admin/http";
import {classRoster,rosterQuerySchema} from "@/domains/school-admin/learners";
import {schoolIdSchema} from "@/domains/school-admin/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function GET(request:Request,context:{params:Promise<{schoolId:string;classId:string}>}){return adminRequest(request,async session=>{
 const p=await context.params;const query=rosterQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 return classRoster(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),query.offset,"teacher");
});}
