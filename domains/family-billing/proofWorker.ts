import {createHash,timingSafeEqual} from 'node:crypto';import {z} from 'zod';import type {Pool} from 'pg';import {getDatabasePool} from '../../platform/db/pool';import {familyBillingEnabled} from './http';import {readFamilyBody} from '../family/http';import {authorizeFamilyProofWorker} from './service';
const uuid=z.string().uuid().toLowerCase();export const proofWorkerInput=z.object({version:z.literal('proof-worker-v1'),purpose:z.literal('PAYMENT_PROOF_SCAN'),grantId:uuid,personId:uuid,schoolId:uuid,learnerPersonId:uuid}).strict();
export type ProofWorkerInput=z.infer<typeof proofWorkerInput>;
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
export function proofWorkerRequest(deps={pool:getDatabasePool,decide:authorizeFamilyProofWorker}){return async(request:Request)=>{
 if(!familyBillingEnabled()||process.env.PEOS_SPACECASE_PROOF_WORKER_ENABLED!=='true')return Response.json({error:'PROOF_WORKER_NOT_ENABLED'},{status:503,headers});
 try{
  if(request.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  const configured=process.env.PEOS_SPACECASE_PROOF_WORKER_TOKEN_SHA256??'',token=/^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!/^[a-f0-9]{64}$/.test(configured))return Response.json({error:'PROOF_WORKER_UNAVAILABLE'},{status:503,headers});
  if(!token||!timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(configured,'hex')))return Response.json({error:'FORBIDDEN'},{status:403,headers});
  const schools=z.array(uuid).min(1).max(100).parse((process.env.PEOS_SPACECASE_PROOF_WORKER_SCHOOLS??'').split(',').map(v=>v.trim()));
  if(new URL(request.url).searchParams.size)throw new SyntaxError();const input=proofWorkerInput.parse(await readFamilyBody(request));if(!schools.includes(input.schoolId))return Response.json({error:'FORBIDDEN'},{status:403,headers});
  const result=await deps.decide(deps.pool(),input);return result?Response.json(result,{headers}):Response.json({error:'FAMILY_BILLING_FORBIDDEN'},{status:403,headers});
 }catch(e){return Response.json({error:e instanceof z.ZodError||e instanceof SyntaxError?'INVALID_INPUT':'PROOF_WORKER_UNAVAILABLE'},{status:e instanceof z.ZodError||e instanceof SyntaxError?400:503,headers});}
};}
export type ProofWorkerPool=Pool;
