import {adminRequest} from '@/domains/school-admin/http';import {getDatabasePool} from '@/platform/db/pool';
import {requestId,withdrawInput,withdrawRegistration} from '@/domains/school-registration/service';import {readRegistrationBody} from '@/domains/school-registration/http';
export async function DELETE(request:Request,{params}:{params:Promise<{requestId:string}>}){return adminRequest(request,async s=>({request:await withdrawRegistration(getDatabasePool(),s.personId,requestId.parse((await params).requestId),withdrawInput.parse(await readRegistrationBody(request)).revision)}));}
