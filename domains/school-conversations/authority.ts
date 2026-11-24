import type {Pool} from 'pg';import {z} from 'zod';
import {authorizeFamilyBilling,listFamilyBilling} from '../family-billing/service';import {assertSchoolFinancePermission,FinanceAccessDenied} from '../school-finance/authorization';import {AdminError,transaction} from '../school-admin/service';
export const conversationVersion='finance-conversations-v1' as const;
/** Confirmed current billing contacts may ask/reply about their own Finance notices. No charge permission implied. */
export async function familyConversationAuthority(pool:Pool,person:string,grantId:string){
 const d=await authorizeFamilyBilling(pool,person,z.string().uuid().parse(grantId),'family.finance.read');if(!d)throw new AdminError('CONVERSATION_FORBIDDEN');
 const names=(await pool.query('SELECT person_id,given_name,family_name FROM identity.person_names WHERE person_id=ANY($1::uuid[])',[[person,d.learnerPersonId]])).rows;
 const name=(id:string,fallback:string)=>{const n=names.find(r=>r.person_id===id);return n?`${n.given_name} ${n.family_name}`:fallback;};
 return {learnerName:name(d.learnerPersonId,'Learner'),parentName:name(person,'Family contact'),allowed:true as const,contractVersion:conversationVersion,role:'PARENT' as const,personId:person,schoolId:d.schoolId,learnerPersonId:d.learnerPersonId,grantId:d.grantId,expiresAt:d.expiresAt};
}
export async function familyConversationDirectory(pool:Pool,person:string){const d=await listFamilyBilling(pool,person);return {contractVersion:conversationVersion,personId:person,scopes:d.scopes,truncated:d.truncated};}
/** Principal and current Finance staff can discuss, but this grants no ledger write authority. */
export async function staffConversationAuthority(pool:Pool,person:string,school:string){return transaction(pool,async db=>{
 z.string().uuid().parse(school);try{await assertSchoolFinancePermission(db,person,school,'finance.transactions.read');}catch(e){if(e instanceof FinanceAccessDenied)throw new AdminError('CONVERSATION_FORBIDDEN');throw e;}
 await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,'finance.conversation.authorize','SCHOOL',$2,'ALLOW','current_finance_discussion_scope')",[person,school]);
 return {allowed:true as const,contractVersion:conversationVersion,role:'STAFF' as const,personId:person,schoolId:school,expiresAt:new Date(Date.now()+30000).toISOString()};
 });}
