-- School identification and general contact details; PEOS service access only.
CREATE TABLE organisation.school_profiles (
  school_id uuid PRIMARY KEY REFERENCES organisation.organisations(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  emis_number varchar(80) NOT NULL DEFAULT '', centre_number varchar(80) NOT NULL DEFAULT '',
  address varchar(500) NOT NULL DEFAULT '', country varchar(100) NOT NULL DEFAULT '',
  province varchar(100) NOT NULL DEFAULT '', district varchar(100) NOT NULL DEFAULT '',
  postal_code varchar(30) NOT NULL DEFAULT '', phone varchar(50) NOT NULL DEFAULT '',
  email varchar(254) NOT NULL DEFAULT '', school_type varchar(100) NOT NULL DEFAULT ''
);

ALTER TABLE organisation.school_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organisation.school_profiles FROM PUBLIC;

-- Supabase default privileges may explicitly grant client roles access.
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON organisation.school_profiles FROM %I',client_role);
    END IF;
  END LOOP;
END $$;
