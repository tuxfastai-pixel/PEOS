import {familyBillingRequest} from '@/domains/family-billing/http';
import {saveFamilyBillingSettings} from '@/domains/family-billing/service';
import {readFamilyBody} from '@/domains/family/http';import {getDatabasePool} from '@/platform/db/pool';import {z} from 'zod';
export async function POST(request:Request,{params}:{params:Promise<{schoolId:string}>}){return familyBillingRequest(request,async actor=>saveFamilyBillingSettings(getDatabasePool(),actor,z.string().uuid().parse((await params).schoolId),await readFamilyBody(request)));}
