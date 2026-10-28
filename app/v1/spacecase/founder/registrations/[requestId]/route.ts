import {adminRequest} from '@/domains/school-admin/http';import {getDatabasePool} from '@/platform/db/pool';import {registrationDetail,requestId,reviewRegistration} from '@/domains/school-registration/service';import {readRegistrationBody} from '@/domains/school-registration/http';
type Context={params:Promise<{requestId:string}>};
export async function GET(request:Request,{params}:Context){return adminRequest(request,async s=>registrationDetail(getDatabasePool(),s.personId,requestId.parse((await params).requestId)));}
export async function PATCH(request:Request,{params}:Context){return adminRequest(request,async s=>reviewRegistration(getDatabasePool(),s.personId,requestId.parse((await params).requestId),await readRegistrationBody(request)));}
