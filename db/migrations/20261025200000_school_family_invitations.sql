-- School-scoped contact verification, not a global legal guardianship claim.
CREATE TABLE organisation.family_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 learner_person_id uuid NOT NULL,
 email text NOT NULL CHECK(length(email)<=254 AND email=lower(email)),
 relationship text NOT NULL CHECK(relationship IN ('PARENT','GUARDIAN','CAREGIVER')),
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES identity.persons(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','CLAIMED','CONFIRMED','DECLINED','REVOKED','EXPIRED')),
 claimed_by uuid REFERENCES identity.persons(id),
 claimed_at timestamptz,
 reviewed_by uuid REFERENCES identity.persons(id),
 reviewed_at timestamptz,
 FOREIGN KEY(school_id,learner_person_id) REFERENCES organisation.learner_registrations(school_id,learner_person_id),
 CHECK(expires_at>created_at),
 CHECK((claimed_by IS NULL)=(claimed_at IS NULL)),
 CHECK(status NOT IN ('CLAIMED','CONFIRMED','DECLINED') OR claimed_by IS NOT NULL),
 CHECK(status NOT IN ('CONFIRMED','DECLINED') OR reviewed_by IS NOT NULL)
);
CREATE UNIQUE INDEX family_invitation_pending_idx ON organisation.family_invitations(school_id,learner_person_id,email) WHERE status IN ('ISSUED','CLAIMED');
CREATE INDEX family_invitation_school_idx ON organisation.family_invitations(school_id,created_at DESC);
CREATE INDEX family_invitation_claimant_idx ON organisation.family_invitations(claimed_by) WHERE claimed_by IS NOT NULL;
ALTER TABLE organisation.family_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organisation.family_invitations FROM PUBLIC;
-- A confirmed school contact is canonical only within this school's learner scope.
CREATE TABLE identity.school_family_relationships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invitation_id uuid NOT NULL UNIQUE REFERENCES organisation.family_invitations(id),
 school_id uuid NOT NULL,
 learner_person_id uuid NOT NULL,
 adult_person_id uuid NOT NULL REFERENCES identity.persons(id),
 relationship text NOT NULL CHECK(relationship IN ('PARENT','GUARDIAN','CAREGIVER')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
 confirmed_by uuid NOT NULL REFERENCES identity.persons(id),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 FOREIGN KEY(school_id,learner_person_id) REFERENCES organisation.learner_registrations(school_id,learner_person_id)
);
CREATE UNIQUE INDEX school_family_active_idx ON identity.school_family_relationships(school_id,learner_person_id,adult_person_id) WHERE status='ACTIVE';
ALTER TABLE identity.school_family_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON identity.school_family_relationships FROM PUBLIC;
