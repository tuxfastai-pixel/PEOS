import test from 'node:test';import assert from 'node:assert/strict';
import {registrationInput,reviewInput,pageInput} from '../../domains/school-registration/service';import {emptySchoolProfile} from '../../domains/school-admin/schoolProfile';import {readRegistrationBody} from '../../domains/school-registration/http';
test('registration input permits an intake request without granting authority or accepting arbitrary fields',()=>{
 const {revision,...profile}=emptySchoolProfile;void revision;
 const input={submissionKey:'12345678-1234-4234-8234-123456789012',schoolName:'School',applicantRole:'ADMINISTRATOR',principalEmail:'Principal@Example.test',profile,acknowledged:true};
 assert.equal(registrationInput.parse(input).principalEmail,'principal@example.test');
 for(const bad of [{...input,roleCode:'PRINCIPAL'},{...input,acknowledged:false},{...input,schoolId:'invented'},{...input,principalEmail:'invalid'}])assert.equal(registrationInput.safeParse(bad).success,false);
 assert.equal(reviewInput.safeParse({revision:1,action:'APPROVE',message:'grant'}).success,false);
 assert.equal(reviewInput.safeParse({revision:1,action:'DECLINE',message:''}).success,false);
 assert.equal(pageInput.safeParse({offset:-1}).success,false);
});
test('request body reader bounds streamed bytes and rejects malformed JSON',async()=>{
 assert.equal(await readRegistrationBody(new Request('https://example.test',{method:'POST',body:'x'.repeat(8193)})),null);
 assert.equal(await readRegistrationBody(new Request('https://example.test',{method:'POST',body:'{'})),null);
 assert.deepEqual(await readRegistrationBody(new Request('https://example.test',{method:'POST',body:'{"revision":1}'})),{revision:1});
});
