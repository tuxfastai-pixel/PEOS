import {familyBillingRequest} from '@/domains/family-billing/http';import {grantFamilyBilling,listSchoolBillingContacts} from '@/domains/family-billing/service';import {readFamilyBody} from '@/domains/family/http';import {getDatabasePool} from '@/platform/db/pool';import {z} from 'zod';
type Context={params:Promise<{schoolId:string}>};
export async function GET(request:Request,{params}:Context){return familyBillingRequest(request,async actor=>listSchoolBillingContacts(getDatabasePool(),actor,z.string().uuid().parse((await params).schoolId)));}
export async function POST(request:Request,{params}:Context){return familyBillingRequest(request,async actor=>grantFamilyBilling(getDatabasePool(),actor,z.string().uuid().parse((await params).schoolId),await readFamilyBody(request)));}
