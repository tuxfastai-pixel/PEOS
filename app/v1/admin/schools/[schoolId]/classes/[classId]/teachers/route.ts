import { adminRequest } from "@/domains/school-admin/http";
import { assignClassTeacher, teacherAssignmentSchema } from "@/domains/school-admin/classes";
import { schoolIdSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";
export async function POST(request:Request,context:{params:Promise<{schoolId:string;classId:string}>}){
  return adminRequest(request,async session=>{ const p=await context.params;
    const input=teacherAssignmentSchema.parse(await request.json().catch(()=>null));
    return assignClassTeacher(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),input.teacherPersonId);
  });
}
