import { getDatabasePool } from "../db/pool";
import { introspectBearerSession, readBearerToken, type IntrospectedSession } from "./service";

export async function authenticateRequest(request: Request): Promise<IntrospectedSession | null> {
  const token = readBearerToken(request);
  if (!token) return null;
  return introspectBearerSession(getDatabasePool(), token);
}
