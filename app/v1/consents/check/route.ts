import { z } from "zod";
import { checkConsent } from "../../../../domains/consent/check";
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

  const sourceHeader = request.headers.get("x-psg-source-product");
  if (!sourceHeader || sourceHeader !== parsed.data.sourceProduct) {
    return Response.json({ error: "SOURCE_PRODUCT_MISMATCH" }, { status: 403 });
  }

  return Response.json(await checkConsent(getDatabasePool(), parsed.data));
}
