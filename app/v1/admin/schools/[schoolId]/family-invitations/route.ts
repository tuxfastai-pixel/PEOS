import {adminRequest} from '@/domains/school-admin/http';
import {schoolIdSchema} from '@/domains/school-admin/service';
import {createFamilyInvitation,listFamilyInvitations,familyListQuery} from '@/domains/family/invitations';
import {getDatabasePool} from '@/platform/db/pool';
import {readFamilyBody} from '@/domains/family/http';

export async function GET(request:Request,{params}:{params:Promise<{schoolId:string}>}){return adminRequest(request,async s=>{const q=familyListQuery.parse(Object.fromEntries(new URL(request.url).searchParams));return listFamilyInvitations(getDatabasePool(),s.personId,schoolIdSchema.parse((await params).schoolId),q.offset,q.view);});}
export async function POST(request:Request,{params}:{params:Promise<{schoolId:string}>}){return adminRequest(request,async s=>createFamilyInvitation(getDatabasePool(),s.personId,schoolIdSchema.parse((await params).schoolId),await readFamilyBody(request)),201);}
