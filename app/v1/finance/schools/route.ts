import { adminRequest } from "@/domains/school-admin/http";
import { listFinanceSchools } from "@/domains/school-finance/directory";
import { getDatabasePool } from "@/platform/db/pool";
export async function GET(request: Request) {
  return adminRequest(request, (session) =>
    listFinanceSchools(getDatabasePool(), session.personId),
  );
}
