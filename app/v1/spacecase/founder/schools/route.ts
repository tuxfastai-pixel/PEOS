import {adminRequest} from "@/domains/school-admin/http";
import {directoryQuery,founderDirectory} from "@/domains/founder/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function GET(request:Request){return adminRequest(request,session=>{const q=directoryQuery.parse(Object.fromEntries(new URL(request.url).searchParams));return founderDirectory(getDatabasePool(),session.personId,q.q,q.offset);});}
