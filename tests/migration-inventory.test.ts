import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("PEOS migration inventory matches the audited isolated preview baseline", async () => {
  const expected = [
    "0001_peos_foundation.sql",
    "0002_session_usage_tracking.sql",
    "20261018155909_staff_invitations.sql",
    "20261019094415_learner_enrolment.sql",
    "20261025200000_school_family_invitations.sql",
    "20261027062535_school_profile.sql",
    "20261028151307_school_registration.sql",
    "20261030160000_school_finance_ledger_foundation.sql",
    "20261102090000_finance_staff_invitations.sql",
  ].sort();
  const actual = (await readdir(path.join(process.cwd(), "db", "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(actual, expected, "Migration inventory changed: review and reconcile before recording history");
});
