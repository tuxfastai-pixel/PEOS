import {adminRequest} from '@/domains/school-admin/http';
import {schoolIdSchema} from '@/domains/school-admin/service';
import {withdrawFamilyConnection} from '@/domains/family/connections';
import {readFamilyBody} from '@/domains/family/http';
import {getDatabasePool} from '@/platform/db/pool';
export async function POST(request:Request,{params}:{params:Promise<{invitationId:string}>}){const response=await adminRequest(request,async session=>withdrawFamilyConnection(getDatabasePool(),session.personId,schoolIdSchema.parse((await params).invitationId),await readFamilyBody(request)));response.headers.set('cache-control','private, no-store');return response;}
