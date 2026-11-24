/** Prepared pilot transport only. No route, worker, account provisioning or implicit sending. */
import {createHmac,timingSafeEqual} from 'node:crypto';import {z} from 'zod';
const digits=z.string().regex(/^[1-9][0-9]{7,14}$/);
export const whatsAppPilotConfig=z.object({enabled:z.boolean(),apiVersion:z.string().regex(/^v[0-9]{1,3}\.[0-9]$/),phoneNumberId:z.string().regex(/^[0-9]{5,30}$/),accessToken:z.string().min(20).max(4096),allowedRecipients:z.array(digits).min(1).max(5)}).strict();
const template=z.object({to:digits,name:z.string().regex(/^[a-z0-9_]{1,128}$/),language:z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),parameters:z.array(z.string().min(1).max(512)).max(10)}).strict();
export type WhatsAppPilotConfig=z.infer<typeof whatsAppPilotConfig>;
export type WhatsAppDelivery={status:'NOT_SENT';reason:'DISABLED'|'RECIPIENT_NOT_ALLOWED'|'AUTHORITY_UNAVAILABLE'}|{status:'SUBMITTED';providerMessageId:string}|{status:'FAILED';retryable:boolean}|{status:'UNKNOWN';retryable:false};
/** Caller must supply a fresh canonical channel/recipient decision; a stored phone is not authority. */
export async function sendWhatsAppPilot(config:WhatsAppPilotConfig,value:z.infer<typeof template>,authorize:()=>Promise<{allowed:boolean;recipient:string;expiresAt:string}>,fetchImpl:typeof fetch=fetch):Promise<WhatsAppDelivery>{
 if(process.env.PEOS_WHATSAPP_PILOT_ENABLED!=='true'||!config.enabled)return {status:'NOT_SENT',reason:'DISABLED'};
 const c=whatsAppPilotConfig.parse(config),input=template.parse(value);if(!c.allowedRecipients.includes(input.to))return {status:'NOT_SENT',reason:'RECIPIENT_NOT_ALLOWED'};
 let decision;try{decision=await authorize();}catch{return {status:'NOT_SENT',reason:'AUTHORITY_UNAVAILABLE'};}
 const expiry=Date.parse(decision.expiresAt);if(!decision.allowed||decision.recipient!==input.to||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+60000)return {status:'NOT_SENT',reason:'AUTHORITY_UNAVAILABLE'};
 let response:Response;try{response=await fetchImpl(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`,{method:'POST',headers:{authorization:`Bearer ${c.accessToken}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:input.to,type:'template',template:{name:input.name,language:{code:input.language},...(input.parameters.length?{components:[{type:'body',parameters:input.parameters.map(text=>({type:'text',text}))}]}:{})}}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{return {status:'UNKNOWN',retryable:false};}
 if(response.status>=500)return {status:'UNKNOWN',retryable:false};
 if(!response.ok)return {status:'FAILED',retryable:response.status===429};
 try{const body=z.object({messages:z.array(z.object({id:z.string().min(1).max(300)})).length(1)}).parse(await response.json());return {status:'SUBMITTED',providerMessageId:body.messages[0].id};}catch{return {status:'UNKNOWN',retryable:false};}
}
/** Raw bytes must be authenticated before parsing; provider signatures are not parent identity. */
export function verifyWhatsAppSignature(raw:Buffer,signature:string|null,appSecret:string){if(raw.length>262144||appSecret.length<20||!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;const expected=createHmac('sha256',appSecret).update(raw).digest();return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));}
const inbound=z.object({id:z.string().min(1).max(300),from:digits,timestamp:z.string().regex(/^[0-9]{1,14}$/),type:z.literal('text'),text:z.object({body:z.string().min(1).max(2000)}),context:z.object({id:z.string().max(300)}).optional()});
const delivery=z.object({id:z.string().min(1).max(300),status:z.enum(['sent','delivered','read','failed']),timestamp:z.string().regex(/^[0-9]{1,14}$/),recipient_id:digits});
export function verifiedWhatsAppEvents(raw:Buffer,signature:string|null,appSecret:string,phoneNumberId:string){
 if(!verifyWhatsAppSignature(raw,signature,appSecret))return null;
 try{const envelope=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({changes:z.array(z.object({field:z.string(),value:z.object({metadata:z.object({phone_number_id:z.string()}),messages:z.array(z.unknown()).max(100).optional(),statuses:z.array(z.unknown()).max(100).optional()})})).max(100)})).max(100)}).parse(JSON.parse(raw.toString('utf8')));
 const messages:z.infer<typeof inbound>[]=[],statuses:z.infer<typeof delivery>[]=[];
 for(const entry of envelope.entry)for(const change of entry.changes){if(change.field!=='messages'||change.value.metadata.phone_number_id!==phoneNumberId)continue;for(const m of change.value.messages??[]){const parsed=inbound.safeParse(m);if(parsed.success)messages.push(parsed.data);}for(const s of change.value.statuses??[]){const parsed=delivery.safeParse(s);if(parsed.success)statuses.push(parsed.data);}}
 return {messages,statuses};
 }catch{return null;}
}
