import { adminRequest } from "@/domains/school-admin/http";
import { removeClassTeacher } from "@/domains/school-admin/classes";
import { schoolIdSchema } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";
export async function DELETE(request:Request,context:{params:Promise<{schoolId:string;classId:string;teacherPersonId:string}>}){
  return adminRequest(request,async session=>{ const p=await context.params;
    return removeClassTeacher(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),schoolIdSchema.parse(p.teacherPersonId));
  });
}
