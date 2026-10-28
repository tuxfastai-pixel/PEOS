-- Intake only: no school creation, membership, invitation or role grant.
CREATE TABLE organisation.school_registration_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requester_person_id uuid NOT NULL REFERENCES identity.persons(id),
 submission_key uuid NOT NULL,
 school_name varchar(120) NOT NULL CHECK (char_length(btrim(school_name)) BETWEEN 2 AND 120),
 applicant_role text NOT NULL CHECK (applicant_role IN ('PRINCIPAL','ADMINISTRATOR')),
 principal_email varchar(254) NOT NULL,
 proposed_profile jsonb NOT NULL CHECK (jsonb_typeof(proposed_profile)='object'),
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','IN_REVIEW','MORE_INFORMATION_REQUIRED','DECLINED','WITHDRAWN')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 review_message varchar(500) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(requester_person_id,submission_key)
);
CREATE UNIQUE INDEX school_registration_active_name ON organisation.school_registration_requests(requester_person_id,lower(school_name)) WHERE status IN ('SUBMITTED','IN_REVIEW','MORE_INFORMATION_REQUIRED');
CREATE INDEX school_registration_owner_created ON organisation.school_registration_requests(requester_person_id,created_at DESC,id);
CREATE INDEX school_registration_queue ON organisation.school_registration_requests(status,created_at,id);
ALTER TABLE organisation.school_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organisation.school_registration_requests FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('REVOKE ALL ON organisation.school_registration_requests FROM %I',client_role);
  END IF;
 END LOOP;
END $$;
