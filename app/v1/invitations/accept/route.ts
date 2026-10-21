import { z } from "zod";
import { adminRequest } from "@/domains/school-admin/http";
import { acceptInvitation, AdminError, inviteTokenSchema } from "@/domains/school-admin/service";
import { recipientConfiguration, verifiedRecipient } from "@/domains/school-admin/recipient";
import { getDatabasePool } from "@/platform/db/pool";

export async function POST(request: Request) {
  return adminRequest(request, async session => {
    const { token } = z.object({ token: inviteTokenSchema }).strict().parse(await request.json().catch(() => null));
    const externalToken = request.headers.get("x-psg-identity-token");
    if (!externalToken || externalToken.length > 16_384) throw new AdminError("VERIFIED_RECIPIENT_REQUIRED", 401);
    const pool = getDatabasePool();
    const email = await verifiedRecipient(pool, session.personId, externalToken, recipientConfiguration());
    return acceptInvitation(pool, session.personId, email, token);
  });
}
