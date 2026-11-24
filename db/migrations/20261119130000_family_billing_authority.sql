-- A confirmed school contact is not automatically a billing contact.
CREATE TABLE access.family_billing_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),relationship_id uuid NOT NULL REFERENCES identity.school_family_relationships(id),
 school_id uuid NOT NULL REFERENCES organisation.organisations(id),adult_person_id uuid NOT NULL REFERENCES identity.persons(id),learner_person_id uuid NOT NULL REFERENCES identity.persons(id),
 actions text[] NOT NULL CHECK(cardinality(actions) BETWEEN 1 AND 3 AND actions <@ ARRAY['family.finance.read','family.finance.plan.accept','family.finance.proof.submit']::text[] AND 'family.finance.read'=ANY(actions)),
 granted_by uuid NOT NULL REFERENCES identity.persons(id),granted_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),revoked_by uuid REFERENCES identity.persons(id),revoked_at timestamptz,
 CHECK(granted_by<>adult_person_id),CHECK(expires_at>granted_at),CHECK((status='REVOKED')=(revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX active_family_billing_grant ON access.family_billing_grants(relationship_id) WHERE status='ACTIVE';
CREATE INDEX family_billing_owner ON access.family_billing_grants(adult_person_id,school_id) WHERE status='ACTIVE';
ALTER TABLE access.family_billing_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON access.family_billing_grants FROM PUBLIC;
