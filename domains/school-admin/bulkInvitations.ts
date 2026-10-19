import type { Pool } from "pg";
import { z } from "zod";
import { AdminError,assertSchoolAdmin,createInvitation,invitationSchema } from "./service";
import { recordAuditEvent } from "../../platform/audit/service";

export const bulkInvitationSchema=z.object({recipients:z.array(invitationSchema).min(1).max(50)}).strict().superRefine((value,ctx)=>{
  const seen=new Set<string>();
  for(const [index,row] of value.recipients.entries()){
    if(seen.has(row.email))ctx.addIssue({code:z.ZodIssueCode.custom,path:["recipients",index,"email"],message:"Duplicate recipient"});
    seen.add(row.email);
  }
});
type Recipient=z.infer<typeof invitationSchema>;
export type BulkInvitationResult=Recipient & (
  | {status:"CREATED";id:string;token:string;expiresAt:Date;emailStatus:"NOT_SENT"}
  | {status:"SKIPPED";reason:"INVITATION_ALREADY_PENDING"|"ALREADY_SCHOOL_MEMBER"}
  | {status:"FAILED";reason:"SCHOOL_ADMIN_REQUIRED"|"SERVICE_UNAVAILABLE"}
);

export async function createBulkInvitations(pool:Pool,actor:string,schoolId:string,input:z.infer<typeof bulkInvitationSchema>){
  await assertSchoolAdmin(pool,actor,schoolId);
  const results:BulkInvitationResult[]=new Array(input.recipients.length);
  let next=0;
  // Bound connection use and latency. Each recipient has its own audited transaction
  // and fresh authority check; a partial failure cannot fabricate a successful row.
  async function worker(){
    while(next<input.recipients.length){
      const index=next++;const recipient=input.recipients[index];
      try{
        const created=await createInvitation(pool,actor,schoolId,recipient,{skipExistingMembers:true});
        results[index]={...recipient,status:"CREATED",id:created.id,token:created.token,expiresAt:created.expiresAt,emailStatus:"NOT_SENT"};
      }catch(error){
        const code=error instanceof AdminError?error.code:"SERVICE_UNAVAILABLE";
        if(code==="INVITATION_ALREADY_PENDING"||code==="ALREADY_SCHOOL_MEMBER"){
          results[index]={...recipient,status:"SKIPPED",reason:code};
        }else{
          results[index]={...recipient,status:"FAILED",reason:code==="SCHOOL_ADMIN_REQUIRED"?code:"SERVICE_UNAVAILABLE"};
        }
        await recordAuditEvent(pool,{actorPersonId:actor,action:"school.invitation.bulk_recipient",resourceType:"SchoolAdministration",
          resourceId:schoolId,decision:"DENY",reason:["INVITATION_ALREADY_PENDING","ALREADY_SCHOOL_MEMBER","SCHOOL_ADMIN_REQUIRED"].includes(code)?code:"SERVICE_UNAVAILABLE"});
      }
    }
  }
  const workers=await Promise.allSettled(Array.from({length:Math.min(4,input.recipients.length)},()=>worker()));
  if(workers.some(value=>value.status==="rejected"))throw new Error("Bulk invitation audit unavailable");
  return {results,delivery:{mode:"MANUAL",emailEnabled:false,status:"NOT_SENT"}};
}
