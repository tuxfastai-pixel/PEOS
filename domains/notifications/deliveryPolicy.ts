/** Metadata only. Never put recipients, message bodies, links or credentials here. */
export type SubmissionResult =
  | {status:'SUBMITTED';providerMessageId:string}
  | {status:'RETRYABLE';reason:'RATE_LIMITED'|'PROVIDER_UNAVAILABLE'|'NETWORK_UNCERTAIN'|'REQUEST_IN_PROGRESS';retryAfterSeconds?:number}
  | {status:'FAILED';reason:'PROVIDER_REJECTED'|'CONFIGURATION_REQUIRED'|'IDEMPOTENCY_CONFLICT'|'INVALID_PROVIDER_RESPONSE'|'QUOTA_EXCEEDED'};
export type AttemptRecord = {attempt:number;attemptedAt:number;result:SubmissionResult};
export type RetryDecision = {status:'RETRY_WAIT';nextAttemptAt:number}|{status:'NEEDS_REVIEW';reason:'ATTEMPTS_EXHAUSTED'|'RETRY_WINDOW_CLOSED'|'INVALID_HISTORY'}|{status:'STOP'};
// Stop well inside the provider's 24-hour idempotency window. No automatic re-keying.
export const RETRY_WINDOW_MS=23*60*60*1000;
export const MAX_ATTEMPTS=5;
export function retryDecision(record:AttemptRecord,firstAttemptAt:number,now:number):RetryDecision{
 if(!Number.isSafeInteger(record.attempt)||record.attempt<1||![firstAttemptAt,now,record.attemptedAt].every(Number.isSafeInteger)||firstAttemptAt>record.attemptedAt||record.attemptedAt>now)return {status:'NEEDS_REVIEW',reason:'INVALID_HISTORY'};
 if(record.result.status!=='RETRYABLE')return {status:'STOP'};
 if(record.attempt>=MAX_ATTEMPTS)return {status:'NEEDS_REVIEW',reason:'ATTEMPTS_EXHAUSTED'};
 const hint=record.result.retryAfterSeconds;
 if(hint!==undefined&&(!Number.isFinite(hint)||hint<0))return {status:'NEEDS_REVIEW',reason:'INVALID_HISTORY'};
 const delay=Math.max(60*2**(record.attempt-1),hint??0)*1000;
 const nextAttemptAt=now+delay;
 if(!Number.isSafeInteger(nextAttemptAt)||nextAttemptAt>=firstAttemptAt+RETRY_WINDOW_MS)return {status:'NEEDS_REVIEW',reason:'RETRY_WINDOW_CLOSED'};
 return {status:'RETRY_WAIT',nextAttemptAt};
}
