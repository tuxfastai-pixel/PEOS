import type {Pool} from 'pg';
import {z} from 'zod';
import {transaction,AdminError,listAdminSchools} from '../school-admin/service';
import {getTeacherContext} from '../teacher/context';
const uuid=z.string().uuid();
const eligible=`f.status='ACTIVE' AND i.status='CONFIRMED' AND i.claimed_by=f.adult_person_id
 AND i.school_id=f.school_id AND i.learner_person_id=f.learner_person_id
 AND adult.status='ACTIVE' AND child.status='ACTIVE' AND o.status='ACTIVE' AND o.organisation_type='SCHOOL'
 AND lr.status='ACTIVE' AND lm.status='ACTIVE' AND lm.membership_type='LEARNER'
 AND lm.starts_at<=clock_timestamp() AND (lm.ends_at IS NULL OR lm.ends_at>clock_timestamp())`;
const joins=`FROM identity.school_family_relationships f
 JOIN organisation.family_invitations i ON i.id=f.invitation_id
 JOIN identity.persons adult ON adult.id=f.adult_person_id JOIN identity.persons child ON child.id=f.learner_person_id
 JOIN organisation.organisations o ON o.id=f.school_id
 JOIN organisation.learner_registrations lr ON lr.school_id=f.school_id AND lr.learner_person_id=f.learner_person_id
 JOIN organisation.memberships lm ON lm.person_id=f.learner_person_id AND lm.organisation_id=f.school_id AND lm.membership_type='LEARNER'
 LEFT JOIN identity.person_names an ON an.person_id=f.adult_person_id LEFT JOIN identity.person_names cn ON cn.person_id=f.learner_person_id`;
const classes=`ARRAY(SELECT c.id FROM organisation.classes c JOIN organisation.class_memberships cm ON cm.class_id=c.id WHERE c.school_id=f.school_id AND cm.learner_person_id=f.learner_person_id AND c.status='ACTIVE' AND cm.status='ACTIVE' ORDER BY c.id)`;
const columns=`f.id AS "relationshipId",f.school_id AS "schoolId",f.adult_person_id AS "parentPersonId",f.learner_person_id AS "learnerPersonId",o.display_name AS "schoolName",COALESCE(NULLIF(concat_ws(' ',an.given_name,an.family_name),''),'Family contact') AS "parentName",COALESCE(NULLIF(concat_ws(' ',cn.given_name,cn.family_name),''),'Learner') AS "learnerName",${classes} AS "classIds"`;
const expiry=()=>new Date(Date.now()+30000).toISOString();
async function audit(pool:Pick<Pool,'query'>,actor:string,action:string,school:string){await pool.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,$2,'SCHOOL_NOTICE',$3,'ALLOW','current_school_notice_scope')",[actor,action,school]);}
/** General school correspondence is separate from access to financial records. */
export async function parentNoticeContext(pool:Pool,person:string){uuid.parse(person);return transaction(pool,async db=>{
 const rows=(await db.query(`SELECT DISTINCT ${columns} ${joins} WHERE f.adult_person_id=$1 AND ${eligible} ORDER BY "relationshipId" LIMIT 501`,[person])).rows;
 if(rows.length>500)throw new AdminError('NOTICE_DIRECTORY_LIMIT',409);
 await audit(db,person,'school.notices.parent.context',person);
 return {contractVersion:'school-notices-v1' as const,personId:person,expiresAt:expiry(),relationships:rows};
});}
export async function staffNoticeDirectory(pool:Pool,person:string){uuid.parse(person);
 const schools=await listAdminSchools(pool,person),teacher=await getTeacherContext(pool,person);
 if(teacher&&!schools.some(s=>s.id===teacher.schoolId)){const school=(await pool.query('SELECT display_name FROM organisation.organisations WHERE id=$1',[teacher.schoolId])).rows[0];if(school)schools.push({id:teacher.schoolId,displayName:school.display_name,principal:false,teacherOnly:true});}
 const output=[];
 for(const s of schools){const teacherOnly=Boolean(s.teacherOnly);const rows=(await pool.query("SELECT id,name FROM organisation.classes WHERE school_id=$1 AND status='ACTIVE' AND ($2::boolean OR id=ANY($3::uuid[])) ORDER BY name,id LIMIT 201",[s.id,!teacherOnly,teacher?.schoolId===s.id?teacher!.classIds:[]])).rows;if(rows.length>200)throw new AdminError('NOTICE_CLASS_LIMIT',409);output.push({schoolId:s.id,schoolName:s.displayName,schoolWide:!teacherOnly,classes:rows});}
 await audit(pool,person,'school.notices.staff.directory',person);
 return {contractVersion:'school-notices-v1' as const,personId:person,expiresAt:expiry(),schools:output};
}
export async function staffNoticeAudience(pool:Pool,person:string,school:string,classId?:string){uuid.parse(school);if(classId)uuid.parse(classId);
 const directory=await staffNoticeDirectory(pool,person),scope=directory.schools.find(s=>s.schoolId===school);
 if(!scope||(!classId&&!scope.schoolWide)||(classId&&!scope.classes.some(c=>c.id===classId)))throw new AdminError('SCHOOL_NOTICE_FORBIDDEN');
 const rows=(await pool.query(`SELECT DISTINCT ${columns} ${joins} WHERE f.school_id=$1 AND ${eligible} AND ($2::uuid IS NULL OR $2=ANY(${classes})) ORDER BY "relationshipId" LIMIT 501`,[school,classId??null])).rows;
 if(rows.length>500)throw new AdminError('NOTICE_AUDIENCE_LIMIT',409);
 await audit(pool,person,'school.notices.audience',school);
 return {contractVersion:'school-notices-v1' as const,personId:person,expiresAt:expiry(),schoolId:school,schoolName:scope.schoolName,schoolWide:scope.schoolWide,classId:classId??null,className:classId?scope.classes.find(c=>c.id===classId)!.name:null,recipients:rows.map(r=>({...r,classIds:classId?[classId]:r.classIds}))};
}
