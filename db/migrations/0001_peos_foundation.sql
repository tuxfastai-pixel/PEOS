CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS organisation;
CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS consent;
CREATE SCHEMA IF NOT EXISTS product;
CREATE SCHEMA IF NOT EXISTS session;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS identity.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DECEASED','MERGED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.persons(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.credential_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES identity.accounts(id),
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS organisation.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_type text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisation.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.persons(id),
  organisation_id uuid NOT NULL REFERENCES organisation.organisations(id),
  membership_type text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  UNIQUE(person_id, organisation_id, membership_type)
);

CREATE TABLE IF NOT EXISTS access.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS access.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS access.role_permissions (
  role_id uuid NOT NULL REFERENCES access.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES access.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS access.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.persons(id),
  role_id uuid NOT NULL REFERENCES access.roles(id),
  organisation_id uuid REFERENCES organisation.organisations(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS organisation.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  external_ref text,
  name text NOT NULL,
  academic_year integer,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  UNIQUE(school_id, external_ref)
);

CREATE TABLE IF NOT EXISTS organisation.class_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES organisation.classes(id),
  learner_person_id uuid NOT NULL REFERENCES identity.persons(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  UNIQUE(class_id, learner_person_id)
);

CREATE TABLE IF NOT EXISTS organisation.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_person_id uuid NOT NULL REFERENCES identity.persons(id),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  class_id uuid REFERENCES organisation.classes(id),
  assignment_type text NOT NULL DEFAULT 'TEACHER',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS product.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE IF NOT EXISTS product.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.persons(id),
  product_id uuid NOT NULL REFERENCES product.products(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  UNIQUE(person_id, product_id)
);

CREATE TABLE IF NOT EXISTS product.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.persons(id),
  product_id uuid NOT NULL REFERENCES product.products(id),
  entitlement_code text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ENDED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS consent.grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_person_id uuid NOT NULL REFERENCES identity.persons(id),
  subject_person_id uuid NOT NULL REFERENCES identity.persons(id),
  purpose text NOT NULL,
  source_product text NOT NULL,
  destination_product text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED','REVOKED','EXPIRED')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS consent_grants_lookup_idx
  ON consent.grants(subject_person_id, purpose, source_product, destination_product, status);

CREATE TABLE IF NOT EXISTS session.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES identity.accounts(id),
  token_hash text NOT NULL UNIQUE,
  issuer text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON session.sessions(token_hash);

CREATE TABLE IF NOT EXISTS audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_person_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  decision text CHECK (decision IN ('ALLOW','DENY')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO access.roles(code, name) VALUES
  ('TEACHER','Teacher'),
  ('CLASS_TEACHER','Class Teacher'),
  ('SUBJECT_TEACHER','Subject Teacher'),
  ('GRADE_HEAD','Grade Head'),
  ('SUPPORT_TEACHER','Support Teacher'),
  ('SCHOOL_ADMINISTRATOR','School Administrator'),
  ('PRINCIPAL','Principal')
ON CONFLICT (code) DO NOTHING;

INSERT INTO product.products(code, name) VALUES
  ('SPACECASE','SpaceCase'),
  ('ATLAS','Atlas HDOS')
ON CONFLICT (code) DO NOTHING;
