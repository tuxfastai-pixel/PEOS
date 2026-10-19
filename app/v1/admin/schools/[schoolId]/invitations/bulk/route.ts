import {adminRequest} from "@/domains/school-admin/http";
import {bulkInvitationSchema,createBulkInvitations} from "@/domains/school-admin/bulkInvitations";
import {schoolIdSchema} from "@/domains/school-admin/service";
import {getDatabasePool} from "@/platform/db/pool";
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{schoolId:string}>}){
  return adminRequest(request,async session=>{
    const input=bulkInvitationSchema.parse(await request.json().catch(()=>null));
    return createBulkInvitations(getDatabasePool(),session.personId,schoolIdSchema.parse((await context.params).schoolId),input);
  });
}
