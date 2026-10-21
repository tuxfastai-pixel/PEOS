import { adminRequest } from "@/domains/school-admin/http";
import { listAdminSchools } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";

export async function GET(request: Request) {
  return adminRequest(request, async session => ({ schools: await listAdminSchools(getDatabasePool(), session.personId) }));
}
