import {adminRequest} from '@/domains/school-admin/http';
import {familyHistoryQuery,listFamilyConnections} from '@/domains/family/connections';
import {getDatabasePool} from '@/platform/db/pool';
export async function GET(request:Request){const response=await adminRequest(request,async session=>listFamilyConnections(getDatabasePool(),session.personId,familyHistoryQuery.parse(Object.fromEntries(new URL(request.url).searchParams)).offset));response.headers.set('cache-control','private, no-store');return response;}
