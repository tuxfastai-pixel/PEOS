import {adminRequest} from "@/domains/school-admin/http";
import {removeClassLearner} from "@/domains/school-admin/learners";
import {schoolIdSchema} from "@/domains/school-admin/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function DELETE(request:Request,context:{params:Promise<{schoolId:string;classId:string;personId:string}>}){return adminRequest(request,async session=>{
 const p=await context.params;return removeClassLearner(getDatabasePool(),session.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.classId),schoolIdSchema.parse(p.personId));
});}
