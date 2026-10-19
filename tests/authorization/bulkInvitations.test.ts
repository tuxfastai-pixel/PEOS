import assert from "node:assert/strict";
import test from "node:test";
import {bulkInvitationSchema} from "../../domains/school-admin/bulkInvitations";

test("bulk payload validates every recipient and rejects duplicate normalized addresses",()=>{
  const recipient={email:" Teacher@EXAMPLE.TEST ",roleCode:"TEACHER"};
  assert.equal(bulkInvitationSchema.parse({recipients:[recipient]}).recipients[0].email,"teacher@example.test");
  for(const recipients of [[],Array.from({length:51},(_,i)=>({...recipient,email:`p${i}@example.test`})),[recipient,{...recipient,email:"teacher@example.test"}], [{...recipient,roleCode:"PRINCIPAL"}], [{...recipient,email:"invalid"}], [{...recipient,schoolId:"untrusted"}]]){
    assert.equal(bulkInvitationSchema.safeParse({recipients}).success,false);
  }
  assert.equal(bulkInvitationSchema.safeParse({recipients:[recipient],delivery:"EMAIL"}).success,false);
  assert.equal(bulkInvitationSchema.parse({recipients:Array.from({length:50},(_,i)=>({...recipient,email:`p${i}@example.test`}))}).recipients.length,50);
});
