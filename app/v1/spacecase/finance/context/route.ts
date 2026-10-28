import {adminRequest} from '@/domains/school-admin/http';import {financeSchools} from '@/domains/school-finance/authority';import {getDatabasePool} from '@/platform/db/pool';
export async function GET(request:Request){return adminRequest(request,s=>financeSchools(getDatabasePool(),s.personId));}
