import { Client } from "pg";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const personId = arg("person-id");
  const schoolName = arg("school-name");
  const className = arg("class-name");
  const roleCode = arg("role-code") ?? "TEACHER";

  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!personId || !schoolName) throw new Error("--person-id and --school-name are required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const person = await client.query("SELECT id FROM identity.persons WHERE id = $1 AND status = 'ACTIVE'", [personId]);
    if (!person.rows[0]) throw new Error("Active person not found");

    const role = await client.query<{ id: string }>("SELECT id FROM access.roles WHERE code = $1", [roleCode]);
    if (!role.rows[0]) throw new Error(`Role not found: ${roleCode}`);

    const school = await client.query<{ id: string }>(
      "INSERT INTO organisation.organisations(organisation_type, display_name) VALUES ('SCHOOL',$1) RETURNING id",
      [schoolName],
    );
    const schoolId = school.rows[0].id;

    await client.query(
      "INSERT INTO organisation.memberships(person_id, organisation_id, membership_type) VALUES ($1,$2,'STAFF')",
      [personId, schoolId],
    );

    await client.query(
      "INSERT INTO access.role_assignments(person_id, role_id, organisation_id) VALUES ($1,$2,$3)",
      [personId, role.rows[0].id, schoolId],
    );

    let classId: string | undefined;
    if (className) {
      const klass = await client.query<{ id: string }>(
        "INSERT INTO organisation.classes(school_id, name) VALUES ($1,$2) RETURNING id",
        [schoolId, className],
      );
      classId = klass.rows[0].id;
    }

    await client.query(
      "INSERT INTO organisation.teacher_assignments(teacher_person_id, school_id, class_id, assignment_type) VALUES ($1,$2,$3,$4)",
      [personId, schoolId, classId ?? null, roleCode],
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({ personId, schoolId, classId: classId ?? null, roleCode }));
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
