import { z } from "zod";
import { adminRequest } from "@/domains/school-admin/http";
import { inviteTokenSchema, previewInvitation } from "@/domains/school-admin/service";
import { getDatabasePool } from "@/platform/db/pool";

export async function POST(request: Request) {
  return adminRequest(request, async () => {
    const { token } = z.object({ token: inviteTokenSchema }).strict().parse(await request.json().catch(() => null));
    return previewInvitation(getDatabasePool(), token);
  });
}
