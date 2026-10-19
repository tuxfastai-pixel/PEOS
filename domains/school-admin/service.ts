import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { hashBearerToken } from "../../platform/session/service";
import { invitationDelivery } from "../notifications/invitationDelivery";

export class AdminError extends Error {
  constructor(public readonly code: string, public readonly status = 403) { super(code); }
}
export const schoolIdSchema = z.string().uuid().transform(v=>v.toLowerCase());
export const schoolNameSchema = z.object({ displayName: z.string().trim().min(2).max(120) }).strict();
export const invitationSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  roleCode: z.enum(["TEACHER", "SCHOOL_ADMINISTRATOR"]),
}).strict();
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
type Database = Pick<Pool, "query">;
type InvitationInput = z.infer<typeof invitationSchema>;

export async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function assertSchoolAdmin(db: Database, personId: string, schoolId: string) {
  const result = await db.query(`SELECT o.id FROM organisation.organisations o
    JOIN organisation.memberships m ON m.organisation_id=o.id
    JOIN access.role_assignments ra ON ra.organisation_id=o.id AND ra.person_id=m.person_id
    JOIN access.roles r ON r.id=ra.role_id JOIN identity.persons p ON p.id=m.person_id
    WHERE o.id=$2 AND m.person_id=$1 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE'
      AND p.status='ACTIVE' AND m.membership_type='STAFF' AND m.status='ACTIVE'
      AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
      AND r.code IN ('SCHOOL_ADMINISTRATOR','PRINCIPAL')
    FOR SHARE OF o,m,ra,p`, [personId, schoolId]);
  if (!result.rows.length) throw new AdminError("SCHOOL_ADMIN_REQUIRED");
}

export async function listAdminSchools(db: Database, personId: string) {
  const result = await db.query(`SELECT DISTINCT o.id, o.display_name AS "displayName"
    FROM organisation.organisations o JOIN organisation.memberships m ON m.organisation_id=o.id
    JOIN access.role_assignments ra ON ra.organisation_id=o.id AND ra.person_id=m.person_id
    JOIN access.roles r ON r.id=ra.role_id JOIN identity.persons p ON p.id=m.person_id
    WHERE m.person_id=$1 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE' AND p.status='ACTIVE'
      AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
      AND r.code IN ('SCHOOL_ADMINISTRATOR','PRINCIPAL') ORDER BY "displayName",o.id`, [personId]);
  return result.rows;
}

export async function audit(db: Database, actor: string, action: string, schoolId: string, resourceId: string) {
  await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason,metadata)
    VALUES ($1,$2,'SCHOOL',$3,'ALLOW','school_scoped_admin_action',jsonb_build_object('schoolId',$4::text))`,
  [actor, action, resourceId, schoolId]);
}

export async function renameSchool(pool: Pool, actor: string, schoolId: string, displayName: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const result = await db.query(`UPDATE organisation.organisations SET display_name=$2 WHERE id=$1 RETURNING id,display_name AS "displayName"`, [schoolId, displayName]);
    await audit(db, actor, "school.update", schoolId, schoolId);
    return result.rows[0];
  });
}

export async function listInvitations(pool: Pool, actor: string, schoolId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const result = await db.query(`SELECT id,email,role_code AS "roleCode",expires_at AS "expiresAt",
      accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM organisation.staff_invitations
      WHERE school_id=$1 ORDER BY created_at DESC LIMIT 200`, [schoolId]);
    await audit(db, actor, "school.invitation.list", schoolId, schoolId);
    return result.rows.map(row => ({ ...row, emailStatus: invitationDelivery.status }));
  });
}

export async function createInvitation(pool: Pool, actor: string, schoolId: string, input: InvitationInput, options: {skipExistingMembers?:boolean} = {}) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([schoolId.toLowerCase(), input.email])]);
    if(options.skipExistingMembers){
      const member=await db.query(`SELECT m.id FROM organisation.staff_invitations i
        JOIN organisation.memberships m ON m.person_id=i.accepted_by AND m.organisation_id=i.school_id
        JOIN identity.persons p ON p.id=m.person_id
        WHERE i.school_id=$1 AND i.email=$2 AND i.accepted_at IS NOT NULL
          AND m.membership_type='STAFF' AND m.status='ACTIVE' AND p.status='ACTIVE'
          AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now()) LIMIT 1`,[schoolId,input.email]);
      if(member.rows.length)throw new AdminError("ALREADY_SCHOOL_MEMBER",409);
    }
    const pending = await db.query(`SELECT id FROM organisation.staff_invitations WHERE school_id=$1 AND email=$2
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`, [schoolId, input.email]);
    if (pending.rows.length) throw new AdminError("INVITATION_ALREADY_PENDING", 409);
    const token = randomBytes(32).toString("base64url");
    const result = await db.query(`INSERT INTO organisation.staff_invitations(school_id,email,role_code,token_hash,created_by,expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+interval '7 days') RETURNING id,expires_at AS "expiresAt"`,
    [schoolId, input.email, input.roleCode, hashBearerToken(token), actor]);
    await audit(db, actor, "school.invitation.create", schoolId, result.rows[0].id);
    return { ...result.rows[0], token, delivery: invitationDelivery };
  });
}

export async function replaceInvitationLink(pool: Pool, actor: string, schoolId: string, invitationId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const existing = await db.query(`SELECT created_by FROM organisation.staff_invitations
      WHERE id=$1 AND school_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL
        AND expires_at>now() FOR UPDATE`, [invitationId, schoolId]);
    if (!existing.rows.length) throw new AdminError("INVITATION_UNAVAILABLE", 410);
    await assertSchoolAdmin(db, existing.rows[0].created_by, schoolId);
    const token = randomBytes(32).toString("base64url");
    // Atomic rotation serializes against acceptance and revocation. Keep the original
    // expiry and issuing administrator; replacement must not revive an unusable invite.
    const result = await db.query(`UPDATE organisation.staff_invitations SET token_hash=$3
      WHERE id=$1 AND school_id=$2 AND accepted_at IS NULL
        AND revoked_at IS NULL AND expires_at>now()
      RETURNING id,email,role_code AS "roleCode",expires_at AS "expiresAt"`,
    [invitationId, schoolId, hashBearerToken(token)]);
    if (!result.rows.length) throw new AdminError("INVITATION_UNAVAILABLE", 410);
    await audit(db, actor, "school.invitation.replace_link", schoolId, invitationId);
    return { ...result.rows[0], token, delivery: invitationDelivery };
  });
}

export async function revokeInvitation(pool: Pool, actor: string, schoolId: string, invitationId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const result = await db.query(`UPDATE organisation.staff_invitations SET revoked_at=now()
      WHERE id=$1 AND school_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`, [invitationId, schoolId]);
    if (!result.rows.length) throw new AdminError("INVITATION_UNAVAILABLE", 404);
    await audit(db, actor, "school.invitation.revoke", schoolId, invitationId);
    return { revoked: true };
  });
}

type Invite = { id: string; school_id: string; email: string; role_code: string; created_by: string; display_name: string };
async function usableInvite(db: Database, token: string, lock = false) {
  const result = await db.query<Invite>(`SELECT i.id,i.school_id,i.email,i.role_code,i.created_by,o.display_name
    FROM organisation.staff_invitations i JOIN organisation.organisations o ON o.id=i.school_id
    WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
      AND o.status='ACTIVE' AND o.organisation_type='SCHOOL' ${lock ? "FOR UPDATE OF i" : ""}`, [hashBearerToken(token)]);
  if (!result.rows[0]) throw new AdminError("INVITATION_UNAVAILABLE", 410);
  const invitation = result.rows[0];
  // Revoking the issuing administrator's authority also invalidates their outstanding invitations.
  await assertSchoolAdmin(db, invitation.created_by, invitation.school_id);
  return invitation;
}

export async function previewInvitation(pool: Pool, token: string) {
  return transaction(pool, async db => {
    const invitation = await usableInvite(db, token);
    return { schoolName: invitation.display_name, roleCode: invitation.role_code };
  });
}

export async function acceptInvitation(pool: Pool, personId: string, verifiedEmail: string, token: string) {
  return transaction(pool, async db => {
    const invitation = await usableInvite(db, token, true);
    if (verifiedEmail.toLowerCase() !== invitation.email) throw new AdminError("INVITED_EMAIL_REQUIRED");
    const person = await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR SHARE", [personId]);
    if (!person.rows.length) throw new AdminError("ACTIVE_PERSON_REQUIRED");
    await db.query(`INSERT INTO organisation.memberships(person_id,organisation_id,membership_type)
      VALUES ($1,$2,'STAFF') ON CONFLICT(person_id,organisation_id,membership_type)
      DO UPDATE SET status='ACTIVE', starts_at=now(), ends_at=NULL`, [personId, invitation.school_id]);
    await db.query(`INSERT INTO access.role_assignments(person_id,role_id,organisation_id)
      SELECT $1,r.id,$2 FROM access.roles r WHERE r.code=$3 AND NOT EXISTS(
        SELECT 1 FROM access.role_assignments ra WHERE ra.person_id=$1 AND ra.organisation_id=$2 AND ra.role_id=r.id
        AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())) RETURNING id`,
    [personId, invitation.school_id, invitation.role_code]);
    await db.query("UPDATE organisation.staff_invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1", [invitation.id, personId]);
    await audit(db, personId, "school.invitation.accept", invitation.school_id, invitation.id);
    return { schoolId: invitation.school_id, roleCode: invitation.role_code };
  });
}
