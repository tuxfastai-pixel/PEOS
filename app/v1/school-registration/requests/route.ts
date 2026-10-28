import {adminRequest} from '@/domains/school-admin/http';
import {getDatabasePool} from '@/platform/db/pool';
import {listMyRegistrations,pageInput,submitRegistration} from '@/domains/school-registration/service';
import {readRegistrationBody} from '@/domains/school-registration/http';
export async function GET(request:Request){return adminRequest(request,async s=>{const q=pageInput.parse(Object.fromEntries(new URL(request.url).searchParams));return listMyRegistrations(getDatabasePool(),s.personId,q.offset);});}
export async function POST(request:Request){return adminRequest(request,async s=>({request:await submitRegistration(getDatabasePool(),s.personId,await readRegistrationBody(request)),grantsAuthority:false}),201);}
