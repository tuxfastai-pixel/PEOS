import {ZodError} from 'zod';import {authenticateRequest} from '../../platform/session/authenticate';import {AdminError} from '../school-admin/service';
export const familyBillingEnabled=()=>process.env.PEOS_FAMILY_BILLING_ENABLED==='true';
export async function familyBillingRequest(request:Request,run:(person:string)=>Promise<unknown>){const headers={'cache-control':'private, no-store'};
 if(!familyBillingEnabled())return Response.json({error:'FAMILY_BILLING_NOT_ENABLED'},{status:503,headers});
 try{const session=await authenticateRequest(request);if(!session)return Response.json({error:'UNAUTHENTICATED'},{status:401,headers});return Response.json(await run(session.personId),{headers});}
 catch(e){if(e instanceof AdminError)return Response.json({error:e.code},{status:e.status,headers});if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'INVALID_INPUT'},{status:400,headers});return Response.json({error:'FAMILY_BILLING_UNAVAILABLE'},{status:503,headers});}
}
