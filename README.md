# PEOS

Pinnacle Entity & Operating System (PEOS) is the shared identity, relationship, organisation, role, permission, consent, membership, entitlement, session, notification and governance platform for Pinnacle Sentle Group products.

PEOS is not a feature module inside SpaceCase, Atlas or any other product. It is an independent shared platform boundary.

## Current status

Foundation code gate: **PASS** on `feature/peos-foundation`.

Validated foundation head: `647fb0753eb6d11266bec5c9ebd36535cbc8cdb4`.

The validated foundation includes canonical Person/Account/CredentialIdentity records, organisations and memberships, roles and permissions, school/class authority, consent and entitlement foundations, OIDC identity exchange, hashed/revocable sessions, session introspection with usage tracking, audit, health/readiness boundaries, PostgreSQL migrations, and fail-closed CI verification.

Live integration remains pending external environment inputs: a deploy target, production PostgreSQL connection, and real OIDC issuer/audience/JWKS configuration. Those are release/integration concerns rather than substitutes for canonical PEOS ownership.

## Core responsibilities

- Canonical person identity
- Accounts and credential identities
- Households and relationships
- Organisations and memberships
- Roles, permissions and role assignments
- Product memberships and entitlements
- Consent grants and revocations
- Authenticated sessions
- School staff and class assignment context
- Shared audit and governance contracts

Product-specific operational or developmental records remain in their owning products.
