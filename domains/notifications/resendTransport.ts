import {z} from 'zod';
import type {InvitationEmail} from './invitationDelivery';
import type {SubmissionResult} from './deliveryPolicy';
const email=z.string().email().max(254).refine(v=>!/[\r\n]/.test(v));
const messageSchema=z.object({to:email,subject:z.string().min(1).max(200).refine(v=>!/[\r\n]/.test(v)),text:z.string().min(1).max(16000),html:z.string().min(1).max(32000)}).strict();
const configurationSchema=z.object({apiKey:z.string().min(1).max(512).refine(v=>!/[\s]/.test(v)),from:email}).strict();
const keySchema=z.string().superRefine((value,ctx)=>{const parts=value.split('/');if(parts.length!==3||parts[0]!=='peos-invitation'||!z.string().uuid().safeParse(parts[1]).success||!z.string().uuid().safeParse(parts[2]).success)ctx.addIssue({code:'custom',message:'Invalid operation key'});});
/** Prepared adapter only: no route, worker, environment flag or production import invokes it.
 * The future dispatcher must use an immutable, encrypted outbox payload and durable key,
 * validate current invitation authority before each attempt and persist the outcome.
 */
export function createResendInvitationTransport(configuration:{apiKey:string;from:string},request:typeof fetch=fetch){
 const config=configurationSchema.parse(configuration);
 return {async submit(message:InvitationEmail,idempotencyKey:string):Promise<SubmissionResult>{
  const parsed=messageSchema.safeParse(message),key=keySchema.safeParse(idempotencyKey);
  if(!parsed.success||!key.success)return {status:'FAILED',reason:'CONFIGURATION_REQUIRED'};
  try{
   const response=await request('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${config.apiKey}`,'content-type':'application/json','Idempotency-Key':key.data},body:JSON.stringify({from:config.from,to:[parsed.data.to],subject:parsed.data.subject,text:parsed.data.text,html:parsed.data.html})});
   if(response.ok){const data=await response.json();const id=z.string().uuid().safeParse(data?.id);return id.success?{status:'SUBMITTED',providerMessageId:id.data}:{status:'FAILED',reason:'INVALID_PROVIDER_RESPONSE'};}
   if(response.status===429){let name:unknown;try{name=(await response.json())?.name;}catch{/* Only fixed reason codes leave this adapter. */}if(name==='daily_quota_exceeded'||name==='monthly_quota_exceeded')return {status:'FAILED',reason:'QUOTA_EXCEEDED'};const raw=response.headers.get('retry-after');const seconds=raw&&/^\d+$/.test(raw)?Number(raw):undefined;return {status:'RETRYABLE',reason:'RATE_LIMITED',...(seconds!==undefined&&Number.isFinite(seconds)?{retryAfterSeconds:seconds}:{})};}
   if(response.status>=500)return {status:'RETRYABLE',reason:'PROVIDER_UNAVAILABLE'};
   if(response.status===409){let name:unknown;try{name=(await response.json())?.name;}catch{/* Do not expose provider error bodies. */}return name==='concurrent_idempotent_requests'?{status:'RETRYABLE',reason:'REQUEST_IN_PROGRESS'}:{status:'FAILED',reason:'IDEMPOTENCY_CONFLICT'};}
   return {status:'FAILED',reason:[401,403].includes(response.status)?'CONFIGURATION_REQUIRED':'PROVIDER_REJECTED'};
  }catch{return {status:'RETRYABLE',reason:'NETWORK_UNCERTAIN'};}
 }};
}
