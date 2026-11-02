# School finance workspace authority — prepared

SpaceCase stores financial records. PEOS supplies only canonical current authority and minimum learner identity; its experimental financial ledgers remain inactive prototypes.

Added contracts: GET /v1/finance/schools returns up to 100 currently authorized school names and finance actions, with truncation explicitly indicated. GET /v1/finance/schools/:schoolId/learner?reference=... requires current transaction-record permission and returns only the exact active learner's identifier, reference and names. Lookup is audited without copying names or the admission reference into the audit metadata. No broad finance roster, medical notes, addresses or family history is exposed.

Finance invitations use existing verified-email, expiring opaque token and manual delivery workflows. Creation, rotation, preview and acceptance recheck the issuer's principal authority. Finance roles cannot be self-accepted by the issuer. `PEOS_FINANCE_INVITATIONS_ENABLED` defaults off; turning it on requires verified principal authority and the independently tested release. DELETE /v1/finance/schools/:schoolId/staff/:invitationId ends the accepted invitation's finance role only; it requires a current principal and preserves other staff roles. Pending links still use existing revoke controls. Role revocation affects subsequent decisions immediately; it cannot retract records already downloaded.

`finance.payments.verify` permits a principal or finance manager to review another actor's reported payment. SpaceCase separately enforces independent reviewer, checked evidence reference, one-time transition, audit and current school match. A finance officer cannot verify payments. Summary and audit permissions retain their existing narrower scopes.

This build does not independently appoint a principal, configure MFA, send mail, activate SpaceCase finance or authorize a bank connection. Require fresh CI, isolated database migration proof and intended-account role walkthroughs before activation.

Local validation: typecheck, lint and production build passed; 51 tests passed and 14 database-dependent tests skipped. The new PostgreSQL lifecycle test remains pending execution in CI. Public source publication was blocked by automatic approval review pending explicit user permission; no PR, production role grant, finance invitation activation or deployment was created by this continuation.
