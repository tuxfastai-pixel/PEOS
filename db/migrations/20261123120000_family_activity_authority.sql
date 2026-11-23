-- Add a distinct, explicit permission. Existing grants are never upgraded.
ALTER TABLE access.family_billing_grants DROP CONSTRAINT family_billing_grants_actions_check;
ALTER TABLE access.family_billing_grants ADD CONSTRAINT family_billing_grants_actions_check CHECK(cardinality(actions) BETWEEN 1 AND 4 AND actions <@ ARRAY['family.finance.read','family.finance.plan.accept','family.finance.proof.submit','family.finance.activity.accept']::text[] AND 'family.finance.read'=ANY(actions));
