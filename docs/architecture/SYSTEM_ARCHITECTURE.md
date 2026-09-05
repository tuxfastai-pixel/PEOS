# PEOS System Architecture

## Position in PSG

PEOS is the canonical shared identity and governance platform consumed by SpaceCase, Atlas HDOS, Sentinel OS, Finality OS and future PSG products. It is independently deployable and owns its own PostgreSQL database.

## Canonical domains

- `identity`: Person, Account, CredentialIdentity
- `organisation`: Organisation, Membership, Class, ClassMembership, TeacherAssignment
- `access`: Role, Permission, RolePermission, RoleAssignment
- `consent`: purpose-limited cross-product consent grants and revocation state
- `product`: Product, ProductMembership, Entitlement
- `session`: hashed bearer sessions with expiry and revocation
- `audit`: immutable-style security and governance event stream plus migration ledger

## Trust model

A bearer token is useful only after PEOS validates its SHA-256 hash against an active, unrevoked, unexpired session whose Account and Person are active. Products must not infer a Person from an unverified token.

School context is derived from PEOS membership and assignment records. A learner identifier alone grants no access. The initial SpaceCase integration requires the authenticated teacher to read only their own teacher context. Learner context additionally requires an active teacher-to-class assignment linking the authenticated teacher to the learner.

## Initial SpaceCase contract

SpaceCase calls these PEOS routes:

- `POST /v1/sessions/introspect`
- `GET /v1/people/{personId}/teacher-context`
- `GET /v1/people/{personId}/learner-context?schoolId={schoolId}`
- `POST /v1/consents/check`

These contracts are deliberately narrow. PEOS does not return SpaceCase learning records or Atlas developmental records.

## Persistence boundary

Products may call PEOS APIs but may not directly query or mutate PEOS schemas. PEOS does not directly write product databases. Cross-product sharing must pass through explicit versioned contracts and authorization checks.

## Session issuance

This foundation implements real persistence-backed session introspection and revocation semantics. Credential verification/session issuance is intentionally a separate next security block so that no temporary password system or fake production identity is introduced merely to bootstrap consumers.

## Evolution

The modular-monolith baseline permits domain extraction later if scale or regulatory isolation requires it. Public contract stability takes precedence over internal module layout.
