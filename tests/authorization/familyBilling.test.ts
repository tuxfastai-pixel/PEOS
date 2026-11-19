import {test} from 'node:test';import assert from 'node:assert/strict';
import {billingGrantInput,billingDecisionInput,billingRevokeInput} from '../../domains/family-billing/contracts';
import {familyBillingRequest} from '../../domains/family-billing/http';
test('billing grants need a confirmed billing-authority acknowledgement, bounded action set and explicit expiry',()=>{
 const input={relationshipId:'10000000-0000-4000-8000-000000000001',actions:['family.finance.read'],expiresAt:'2027-12-31T21:59:59.000Z',billingAuthorityChecked:true};assert.equal(billingGrantInput.safeParse(input).success,true);
 for(const change of [{billingAuthorityChecked:false},{actions:['family.finance.proof.submit']},{actions:['family.finance.read','finance.transactions.read']},{adultPersonId:'forged'},{actions:['family.finance.read','family.finance.read']}])assert.equal(billingGrantInput.safeParse({...input,...change}).success,false);
 assert.equal(billingDecisionInput.safeParse({action:'finance.policy.manage'}).success,false);assert.equal(billingRevokeInput.safeParse({acknowledgement:false}).success,false);
});
test('parent billing API is disabled before authentication or data access by default',async()=>{const old=process.env.PEOS_FAMILY_BILLING_ENABLED;delete process.env.PEOS_FAMILY_BILLING_ENABLED;try{let calls=0;const r=await familyBillingRequest(new Request('https://peos.test/v1/family/billing'),async()=>{calls++;return {};});assert.equal(r.status,503);assert.equal(calls,0);assert.equal(r.headers.get('cache-control'),'private, no-store');}finally{if(old===undefined)delete process.env.PEOS_FAMILY_BILLING_ENABLED;else process.env.PEOS_FAMILY_BILLING_ENABLED=old;}});
