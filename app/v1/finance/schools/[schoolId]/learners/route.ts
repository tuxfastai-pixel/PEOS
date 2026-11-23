import {z} from 'zod';import {authenticateRequest} from '@/platform/session/authenticate';import {getDatabasePool} from '@/platform/db/pool';import {FinanceAccessDenied} from '@/domains/school-finance/authorization';import {financeLearnerPicker,resolveFinanceLearners} from '@/domains/school-finance/learnerPicker';import {readFamilyBody} from '@/domains/family/http';
export async function GET(request:Request,{params}:{params:Promise<{schoolId:string}>}){
 const headers={'cache-control':'private, no-store'};try{
  const session=await authenticateRequest(request);if(!session)return Response.json({error:'UNAUTHENTICATED'},{status:401,headers});
  const school=z.string().uuid().parse((await params).schoolId),q=new URL(request.url).searchParams;
  if(request.method!=='GET'&&q.size)throw new SyntaxError();for(const key of q.keys())if(q.getAll(key).length!==1)throw new SyntaxError();
  return Response.json(request.method==='GET'?await financeLearnerPicker(getDatabasePool(),session.personId,school,Object.fromEntries(q)):await resolveFinanceLearners(getDatabasePool(),session.personId,school,z.object({references:z.unknown()}).strict().parse(await readFamilyBody(request,8192)).references),{headers});
 }catch(e){return Response.json({error:e instanceof FinanceAccessDenied?'FINANCE_FORBIDDEN':'FINANCE_LEARNERS_UNAVAILABLE'},{status:e instanceof FinanceAccessDenied?403:e instanceof z.ZodError||e instanceof SyntaxError?400:503,headers});}
}
export const POST=GET;
