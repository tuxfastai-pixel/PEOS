import { z } from "zod";
import { checkConsent } from "../../../../domains/consent/check";
import { recordAuditEvent } from "../../../../platform/audit/service";
import { getDatabasePool } from "../../../../platform/db/pool";
import { authenticateRequest } from "../../../../platform/session/authenticate";

const inputSchema = z.object({
  parentPersonId: z.string().uuid(),
  learnerPersonId: z.string().uuid(),
  purpose: z.string().min(1),
  sourceProduct: z.string().min(1),
  destinationProduct: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const pool = getDatabasePool();
  const sourceHeader = request.headers.get("x-psg-source-product");
  if (!sourceHeader || sourceHeader !== parsed.data.sourceProduct) {
    await recordAuditEvent(pool, {
      actorPersonId: session.personId,
      action: "consent.check",
      resourceType: "Person",
      resourceId: parsed.data.learnerPersonId,
      decision: "DENY",
      reason: "source_product_mismatch",
      metadata: {
        sourceProduct: parsed.data.sourceProduct,
        destinationProduct: parsed.data.destinationProduct,
        purpose: parsed.data.purpose,
      },
    });
    return Response.json({ error: "SOURCE_PRODUCT_MISMATCH" }, { status: 403 });
  }

  const result = await checkConsent(pool, parsed.data);
  await recordAuditEvent(pool, {
    actorPersonId: session.personId,
    action: "consent.check",
    resourceType: "Person",
    resourceId: parsed.data.learnerPersonId,
    decision: result.granted ? "ALLOW" : "DENY",
    reason: result.granted ? "active_consent_grant" : "active_consent_grant_not_found",
    metadata: {
      sourceProduct: parsed.data.sourceProduct,
      destinationProduct: parsed.data.destinationProduct,
      purpose: parsed.data.purpose,
      policyVersion: result.policyVersion,
    },
  });

  return Response.json(result);
}
