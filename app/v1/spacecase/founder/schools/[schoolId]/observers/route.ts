import {adminRequest} from "@/domains/school-admin/http";
import {manageObservers,observerInput} from "@/domains/founder/observers";
import {schoolIdSchema} from "@/domains/school-admin/service";
import {getDatabasePool} from "@/platform/db/pool";
export async function GET(request:Request,context:{params:Promise<{schoolId:string}>}){return adminRequest(request,async session=>manageObservers(getDatabasePool(),session.personId,schoolIdSchema.parse((await context.params).schoolId)),200,{action:"founder.observer.request",resourceType:"SpaceCaseOperations"});}
export async function POST(request:Request,context:{params:Promise<{schoolId:string}>}){return adminRequest(request,async session=>manageObservers(getDatabasePool(),session.personId,schoolIdSchema.parse((await context.params).schoolId),observerInput.parse(await request.json())),200,{action:"founder.observer.request",resourceType:"SpaceCaseOperations"});}
