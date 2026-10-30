-- Foundation only: financial records are school-owned and require application authorization.
-- All monetary amounts are integer cents to avoid floating-point rounding.
CREATE SCHEMA IF NOT EXISTS school_finance;

CREATE TABLE school_finance.fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  academic_year integer NOT NULL CHECK (academic_year BETWEEN 2000 AND 2200),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  currency char(3) NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by uuid NOT NULL REFERENCES identity.persons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, academic_year, name)
);

CREATE TABLE school_finance.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  learner_person_id uuid NOT NULL REFERENCES identity.persons(id),
  fee_schedule_id uuid REFERENCES school_finance.fee_schedules(id),
  invoice_number text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','VOID')),
  created_by uuid NOT NULL REFERENCES identity.persons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, invoice_number),
  UNIQUE(id, school_id)
);

CREATE TABLE school_finance.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  payment_reference text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  received_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('BANK_TRANSFER','CARD','CASH','OTHER')),
  recorded_by uuid NOT NULL REFERENCES identity.persons(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, payment_reference),
  UNIQUE(id, school_id)
);

CREATE TABLE school_finance.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  allocated_by uuid NOT NULL REFERENCES identity.persons(id),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(payment_id, school_id) REFERENCES school_finance.payments(id, school_id),
  FOREIGN KEY(invoice_id, school_id) REFERENCES school_finance.invoices(id, school_id),
  UNIQUE(payment_id, invoice_id)
);

CREATE TABLE school_finance.reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  prepared_by uuid NOT NULL REFERENCES identity.persons(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES identity.persons(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, period_start, period_end),
  CHECK (reviewed_by IS NULL OR reviewed_by <> prepared_by),
  CHECK ((status <> 'APPROVED') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX school_finance_invoices_learner_idx ON school_finance.invoices(school_id,learner_person_id);
CREATE INDEX school_finance_payments_received_idx ON school_finance.payments(school_id,received_at);
CREATE INDEX school_finance_allocations_invoice_idx ON school_finance.payment_allocations(school_id,invoice_id);
CREATE INDEX school_finance_reconciliations_period_idx ON school_finance.reconciliations(school_id,period_start,period_end);
