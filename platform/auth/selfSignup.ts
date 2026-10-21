import type { Pool } from "pg";

// Called only after cryptographic verification of the configured issuer's identity.
// No email-based linking, school membership, role, consent or entitlement is created.
export async function provisionVerifiedIdentity(pool: Pool, provider: string, subject: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify([provider, subject])]);
    const existing = await client.query<{
      account_id: string; person_id: string; account_status: string; person_status: string;
    }>(`SELECT a.id AS account_id, a.person_id, a.status AS account_status, p.status AS person_status
        FROM identity.credential_identities ci
        JOIN identity.accounts a ON a.id = ci.account_id
        JOIN identity.persons p ON p.id = a.person_id
        WHERE ci.provider = $1 AND ci.provider_subject = $2`, [provider, subject]);
    if (existing.rows[0]) {
      await client.query("COMMIT");
      const row = existing.rows[0];
      return row.account_status === "ACTIVE" && row.person_status === "ACTIVE" ? row : null;
    }
    const person = await client.query<{ id: string }>("INSERT INTO identity.persons DEFAULT VALUES RETURNING id");
    const personId = person.rows[0].id;
    const account = await client.query<{ id: string }>(
      "INSERT INTO identity.accounts(person_id) VALUES ($1) RETURNING id", [personId]);
    const accountId = account.rows[0].id;
    await client.query(`INSERT INTO identity.credential_identities(account_id, provider, provider_subject)
      VALUES ($1,$2,$3)`, [accountId, provider, subject]);
    await client.query(`INSERT INTO audit.events(actor_person_id, action, resource_type, resource_id, decision, reason)
      VALUES ($1,'IDENTITY_SELF_SIGNUP','ACCOUNT',$2,'ALLOW','verified_external_identity')`, [personId, accountId]);
    await client.query("COMMIT");
    return { account_id: accountId, person_id: personId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
