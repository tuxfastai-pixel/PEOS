import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type AuditDecision = "ALLOW" | "DENY";

export type AuditEventInput = {
  actorPersonId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  decision?: AuditDecision;
  reason?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAuditEvent(pool: Pool, event: AuditEventInput): Promise<void> {
  await pool.query(
    `
      INSERT INTO audit.events(
        id, actor_person_id, action, resource_type, resource_id,
        decision, reason, metadata, occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())
    `,
    [
      randomUUID(),
      event.actorPersonId ?? null,
      event.action,
      event.resourceType,
      event.resourceId ?? null,
      event.decision ?? null,
      event.reason ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
