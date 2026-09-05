import { getDatabasePool } from "../../../platform/db/pool";
import { checkDatabaseReady } from "../../../platform/health/readiness";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ready = await checkDatabaseReady(() => getDatabasePool().query("SELECT 1"));

  if (!ready) {
    return Response.json({ service: "peos", status: "not_ready" }, { status: 503 });
  }

  return Response.json({ service: "peos", status: "ready" });
}
