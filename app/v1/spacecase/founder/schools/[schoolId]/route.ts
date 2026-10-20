import {z} from "zod";
import {adminRequest} from "@/domains/school-admin/http";
import {founderSchool} from "@/domains/founder/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function GET(request:Request,context:{params:Promise<{schoolId:string}>}){const {schoolId}=await context.params;return adminRequest(request,session=>founderSchool(getDatabasePool(),session.personId,z.string().uuid().parse(schoolId)));}
