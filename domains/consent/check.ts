import type { Pool } from "pg";

export type ConsentCheckInput = {
  parentPersonId: string;
  learnerPersonId: string;
  purpose: string;
  sourceProduct: string;
  destinationProduct: string;
};

export type ConsentCheckResult = {
  granted: boolean;
  consentGrantId?: string;
  policyVersion: string;
};

export async function checkConsent(
  pool: Pool,
  input: ConsentCheckInput,
): Promise<ConsentCheckResult> {
  const result = await pool.query<{ id: string; policy_version: string }>(
    `
      SELECT id, policy_version
      FROM consent.grants
      WHERE grantor_person_id = $1
        AND subject_person_id = $2
        AND purpose = $3
        AND source_product = $4
        AND destination_product = $5
        AND status = 'GRANTED'
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY granted_at DESC
      LIMIT 1
    `,
    [
      input.parentPersonId,
      input.learnerPersonId,
      input.purpose,
      input.sourceProduct,
      input.destinationProduct,
    ],
  );

  const row = result.rows[0];
  if (!row) return { granted: false, policyVersion: "peos-consent-v1" };
  return {
    granted: true,
    consentGrantId: row.id,
    policyVersion: row.policy_version,
  };
}
