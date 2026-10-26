import test from 'node:test';import assert from 'node:assert/strict';
import {retryDecision,RETRY_WINDOW_MS} from '../../domains/notifications/deliveryPolicy';
import {createResendInvitationTransport} from '../../domains/notifications/resendTransport';
const message={to:'teacher@example.test',subject:'School invitation',text:'private-token',html:'<p>private-token</p>'};
const key='peos-invitation/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174001';
const config={apiKey:'fake-test-key',from:'invites@example.test'};
test('prepared transport uses one recipient, fixed endpoint, bounded timeout and stable idempotency; acceptance is not delivery',async()=>{
 const requests:RequestInit[]=[];const adapter=createResendInvitationTransport(config,async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');requests.push(init!);return Response.json({id:'123e4567-e89b-42d3-a456-426614174002'});});
 for(let i=0;i<2;i++)assert.deepEqual(await adapter.submit(message,key),{status:'SUBMITTED',providerMessageId:'123e4567-e89b-42d3-a456-426614174002'});
 assert.deepEqual(requests[0].body,requests[1].body);assert.equal((requests[0].headers as Record<string,string>)['Idempotency-Key'],key);assert.equal(requests[0].redirect,'error');assert.ok(requests[0].signal);assert.deepEqual(JSON.parse(requests[0].body as string).to,[message.to]);
});
test('provider failures have fixed private reasons and distinguish safe retries from terminal failures',async()=>{
 for(const [code,name,status,reason] of [[429,'anything','RETRYABLE','RATE_LIMITED'],[429,'daily_quota_exceeded','FAILED','QUOTA_EXCEEDED'],[429,'monthly_quota_exceeded','FAILED','QUOTA_EXCEEDED'],[503,'anything','RETRYABLE','PROVIDER_UNAVAILABLE'],[409,'concurrent_idempotent_requests','RETRYABLE','REQUEST_IN_PROGRESS'],[409,'invalid_idempotent_request','FAILED','IDEMPOTENCY_CONFLICT'],[401,'anything','FAILED','CONFIGURATION_REQUIRED'],[422,'anything','FAILED','PROVIDER_REJECTED']] as const){const adapter=createResendInvitationTransport(config,async()=>Response.json({name,message:'private-token teacher@example.test'},{status:code,headers:{'retry-after':'120'}}));const r=await adapter.submit(message,key);assert.equal(r.status,status);assert.equal('reason'in r?r.reason:'',reason);assert.equal(JSON.stringify(r).includes('private-token'),false);assert.equal(JSON.stringify(r).includes(message.to),false);}
 const broken=createResendInvitationTransport(config,async()=>{throw Error('secret provider error');});assert.deepEqual(await broken.submit(message,key),{status:'RETRYABLE',reason:'NETWORK_UNCERTAIN'});
});
test('malformed requests fail before transmission and malformed success never claims delivery',async()=>{
 let called=0;const adapter=createResendInvitationTransport(config,async()=>{called++;return Response.json({id:'bad'});});
 assert.equal((await adapter.submit({...message,to:'other@example.test\r\nBcc: hidden@example.test'},key)).status,'FAILED');assert.equal((await adapter.submit(message,'email-in-key@example.test')).status,'FAILED');assert.equal(called,0);assert.deepEqual(await adapter.submit(message,key),{status:'FAILED',reason:'INVALID_PROVIDER_RESPONSE'});
});
test('retry planning respects backoff, provider delay, attempt limit and idempotency deadline',()=>{
 const result={status:'RETRYABLE',reason:'NETWORK_UNCERTAIN'} as const;
 assert.deepEqual(retryDecision({attempt:1,attemptedAt:1000,result},1000,1000),{status:'RETRY_WAIT',nextAttemptAt:61000});
 assert.deepEqual(retryDecision({attempt:2,attemptedAt:1000,result:{status:'RETRYABLE',reason:'RATE_LIMITED',retryAfterSeconds:600}},1000,1000),{status:'RETRY_WAIT',nextAttemptAt:601000});
 assert.deepEqual(retryDecision({attempt:5,attemptedAt:1000,result},1000,1000),{status:'NEEDS_REVIEW',reason:'ATTEMPTS_EXHAUSTED'});
 assert.deepEqual(retryDecision({attempt:1,attemptedAt:0,result},0,RETRY_WINDOW_MS-1),{status:'NEEDS_REVIEW',reason:'RETRY_WINDOW_CLOSED'});
 assert.deepEqual(retryDecision({attempt:0,attemptedAt:0,result},0,0),{status:'NEEDS_REVIEW',reason:'INVALID_HISTORY'});
 assert.deepEqual(retryDecision({attempt:1,attemptedAt:0,result:{status:'SUBMITTED',providerMessageId:'example'}},0,0),{status:'STOP'});
});
