import {adminRequest} from '@/domains/school-admin/http';import {parentNoticeContext} from '@/domains/school-notices/authority';import {getDatabasePool} from '@/platform/db/pool';
export async function GET(request:Request){return adminRequest(request,s=>parentNoticeContext(getDatabasePool(),s.personId));}
