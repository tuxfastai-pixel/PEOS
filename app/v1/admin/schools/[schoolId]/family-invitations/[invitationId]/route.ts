import {adminRequest} from '@/domains/school-admin/http';
import {schoolIdSchema} from '@/domains/school-admin/service';
import {reviewFamilyInvitation,replaceFamilyInvitation} from '@/domains/family/invitations';
import {getDatabasePool} from '@/platform/db/pool';
import {readFamilyBody} from '@/domains/family/http';
export async function PATCH(request:Request,{params}:{params:Promise<{schoolId:string;invitationId:string}>}){return adminRequest(request,async s=>{const p=await params;return reviewFamilyInvitation(getDatabasePool(),s.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.invitationId),await readFamilyBody(request));});}

export async function POST(request:Request,{params}:{params:Promise<{schoolId:string;invitationId:string}>}){return adminRequest(request,async s=>{const p=await params;return replaceFamilyInvitation(getDatabasePool(),s.personId,schoolIdSchema.parse(p.schoolId),schoolIdSchema.parse(p.invitationId));});}
