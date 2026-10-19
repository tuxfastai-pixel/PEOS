CREATE TABLE identity.person_names (
  person_id uuid PRIMARY KEY REFERENCES identity.persons(id),
  given_name text NOT NULL CHECK (length(given_name) BETWEEN 1 AND 80),
  family_name text NOT NULL CHECK (length(family_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organisation.learner_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  learner_person_id uuid NOT NULL REFERENCES identity.persons(id),
  admission_number text NOT NULL CHECK (length(admission_number) BETWEEN 1 AND 40 AND admission_number ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  created_by uuid NOT NULL REFERENCES identity.persons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,admission_number),
  UNIQUE(school_id,learner_person_id)
);
CREATE INDEX learner_registrations_created_by_idx ON organisation.learner_registrations(created_by);
CREATE INDEX learner_registrations_person_idx ON organisation.learner_registrations(learner_person_id);
CREATE INDEX class_memberships_learner_idx ON organisation.class_memberships(learner_person_id,class_id) WHERE status='ACTIVE';
ALTER TABLE identity.person_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation.learner_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON identity.person_names,organisation.learner_registrations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON identity.person_names,organisation.learner_registrations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON identity.person_names,organisation.learner_registrations FROM authenticated;
  END IF;
END $$;
