import { Client } from "pg";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const provider = arg("provider");
  const subject = arg("subject");
  const personId = arg("person-id");

  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!provider || !subject) throw new Error("--provider and --subject are required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    let canonicalPersonId = personId;
    if (canonicalPersonId) {
      const person = await client.query("SELECT id FROM identity.persons WHERE id = $1 AND status = 'ACTIVE'", [canonicalPersonId]);
      if (!person.rows[0]) throw new Error("Active person not found");
    } else {
      const person = await client.query<{ id: string }>("INSERT INTO identity.persons DEFAULT VALUES RETURNING id");
      canonicalPersonId = person.rows[0].id;
    }

    let account = await client.query<{ id: string }>(
      "SELECT id FROM identity.accounts WHERE person_id = $1 AND status = 'ACTIVE' ORDER BY created_at LIMIT 1",
      [canonicalPersonId],
    );
    if (!account.rows[0]) {
      account = await client.query<{ id: string }>(
        "INSERT INTO identity.accounts(person_id) VALUES ($1) RETURNING id",
        [canonicalPersonId],
      );
    }

    const accountId = account.rows[0].id;
    const credential = await client.query<{ id: string }>(
      `INSERT INTO identity.credential_identities(account_id, provider, provider_subject)
       VALUES ($1,$2,$3)
       ON CONFLICT (provider, provider_subject)
       DO UPDATE SET provider_subject = EXCLUDED.provider_subject
       RETURNING id`,
      [accountId, provider, subject],
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({ personId: canonicalPersonId, accountId, credentialIdentityId: credential.rows[0].id }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
