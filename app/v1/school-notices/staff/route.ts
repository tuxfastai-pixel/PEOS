import {adminRequest} from '@/domains/school-admin/http';import {staffNoticeDirectory} from '@/domains/school-notices/authority';import {getDatabasePool} from '@/platform/db/pool';
export async function GET(request:Request){return adminRequest(request,s=>staffNoticeDirectory(getDatabasePool(),s.personId));}
