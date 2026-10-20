import {adminRequest} from "@/domains/school-admin/http";
import {supportContext} from "@/domains/founder/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function GET(request:Request){return adminRequest(request,session=>supportContext(getDatabasePool(),session.personId));}
