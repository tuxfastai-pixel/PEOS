import type {Pool} from 'pg';import {z} from 'zod';
import {transaction} from '../school-admin/service';import {assertSchoolFinancePermission,FinanceAccessDenied} from './authorization';
export const pickerQuery=z.object({q:z.string().trim().max(80).optional(),classId:z.string().uuid().optional(),after:z.string().uuid().optional()}).strict();
export const learnerReferences=z.array(z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).transform(v=>v.toUpperCase())).min(1).max(50).refine(v=>new Set(v).size===v.length);
const fields=`r.learner_person_id AS "personId",r.admission_number AS "admissionNumber",n.given_name AS "givenName",n.family_name AS "familyName"`;
const source=`FROM organisation.learner_registrations r JOIN identity.persons p ON p.id=r.learner_person_id JOIN identity.person_names n ON n.person_id=p.id WHERE r.school_id=$1 AND r.status='ACTIVE' AND p.status='ACTIVE' AND EXISTS(SELECT 1 FROM organisation.memberships m WHERE m.person_id=p.id AND m.organisation_id=r.school_id AND m.membership_type='LEARNER' AND m.status='ACTIVE' AND m.starts_at<=clock_timestamp() AND (m.ends_at IS NULL OR m.ends_at>clock_timestamp()))`;
export async function financeLearnerPicker(pool:Pool,actor:string,school:string,value:unknown){const input=pickerQuery.parse(value);return transaction(pool,async db=>{
 await assertSchoolFinancePermission(db,actor,school,'finance.transactions.record');
 const classes=(await db.query('SELECT id,name,academic_year AS year FROM organisation.classes WHERE school_id=$1 AND status=\'ACTIVE\' ORDER BY academic_year DESC,name,id LIMIT 101',[school])).rows;
 let learners:Record<string,unknown>[]=[];
 if(input.q||input.classId){learners=(await db.query(`SELECT ${fields} ${source} AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM organisation.class_memberships cm JOIN organisation.classes c ON c.id=cm.class_id WHERE cm.learner_person_id=p.id AND cm.class_id=$2 AND cm.status='ACTIVE' AND c.status='ACTIVE' AND c.school_id=r.school_id)) AND ($3='' OR strpos(lower(n.given_name||' '||n.family_name||' '||r.admission_number),lower($3))>0) AND ($4::uuid IS NULL OR p.id>$4) ORDER BY p.id LIMIT 51`,[school,input.classId??null,input.q??'',input.after??null])).rows;}
 await assertSchoolFinancePermission(db,actor,school,'finance.transactions.record');
 await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,'finance.learner.picker','SCHOOL',$2,'ALLOW','current_finance_scope')",[actor,school]);
 return {contractVersion:'finance-learner-picker-v1',classes:classes.slice(0,100),classesTruncated:classes.length>100,learners:learners.slice(0,50),truncated:learners.length>50,nextCursor:learners.length>50?learners[49].personId:null};
 });}
export async function resolveFinanceLearners(pool:Pool,actor:string,school:string,value:unknown){const references=learnerReferences.parse(value);return transaction(pool,async db=>{
 await assertSchoolFinancePermission(db,actor,school,'finance.transactions.record');
 const learners=(await db.query(`SELECT ${fields} ${source} AND r.admission_number=ANY($2::text[]) ORDER BY r.admission_number`,[school,references])).rows;
 if(learners.length!==references.length)throw new FinanceAccessDenied();
 await assertSchoolFinancePermission(db,actor,school,'finance.transactions.record');
 await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,'finance.learner.resolve','SCHOOL',$2,'ALLOW','current_finance_scope')",[actor,school]);
 return {contractVersion:'finance-learner-picker-v1',learners};
 });}
