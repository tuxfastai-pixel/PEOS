import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/**
 * Read-only migration inventory/checksum audit.
 * Requires DATABASE_URL for an isolated database. Never modifies database state.
 * Fails if migration history is missing, incomplete, has extra entries or mismatches.
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required (isolated preview only)");
  const directory = path.join(process.cwd(), "db", "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const expected = new Map<string, string>();
  for (const name of names) {
    const bytes = await readFile(path.join(directory, name));
    expected.set(name, createHash("sha256").update(bytes).digest("hex"));
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const exists = await client.query<{ present: string | null }>(
      "SELECT to_regclass('audit.schema_migrations')::text AS present",
    );
    if (!exists.rows[0]?.present) throw new Error("Migration history table missing");
    const rows = await client.query<{ migration_name: string; checksum: string }>(
      "SELECT migration_name, checksum FROM audit.schema_migrations ORDER BY migration_name",
    );
    const actual = new Map(rows.rows.map((row) => [row.migration_name, row.checksum]));
    let errors = 0;
    for (const [name, checksum] of expected) {
      const found = actual.get(name);
      const status = !found ? "MISSING" : found === checksum ? "MATCH" : "MISMATCH";
      if (status !== "MATCH") errors++;
      console.log(`${status} ${name}`);
    }
    for (const name of actual.keys()) {
      if (!expected.has(name)) {
        console.log(`UNEXPECTED ${name}`);
        errors++;
      }
    }
    console.log(`Audited ${expected.size} SQL files, ${actual.size} recorded migrations; ${errors} discrepancies`);
    if (errors) process.exitCode = 1;
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
