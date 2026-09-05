# PEOS Project Constitution

Every contributor, agent and implementation session must read this document before making production changes.

## 1. Mission

PEOS is the canonical shared platform for identity, relationships, organisations, roles, permissions, consent, product membership, entitlements, sessions, notifications, audit and governance across Pinnacle Sentle Group products.

PEOS exists to prevent each product from inventing its own identity, authorization or consent model.

## 2. Ownership boundary

PEOS owns canonical Person, Account, CredentialIdentity, Household, HouseholdMember, Relationship, Organisation, OrganisationMember, Role, Permission, RoleAssignment, ConsentGrant, ConsentRevocation, Product, ProductMembership, Entitlement, Device, Session, NotificationPreference, AuditEvent and PolicyDecision records.

PEOS may expose school context primitives such as StaffMembership, Class, ClassMembership and TeacherAssignment because these are organisation/relationship/authorization context, not teaching records.

PEOS does not own SpaceCase school-learning records, Atlas developmental records, product-specific workflows, product UI state, AI model infrastructure or agent memory.

## 3. Product isolation

Products consume PEOS through versioned contracts. No product may directly mutate PEOS database tables. PEOS must not directly mutate product databases.

A product identifier, learner identifier, school identifier or referral token grants no authority by itself.

## 4. Authentication and authorization

Authentication resolves to a canonical PEOS person. Authorization is server-side, contextual, least-privilege and fail-closed.

School authorization derives from authenticated identity plus active organisation membership, role and assignment. UI state never constitutes authorization.

Bearer session tokens must not be stored in plaintext. Sessions are revocable and expire.

## 5. Consent

Subscription is not consent. Consent is explicit, purpose-limited, source/destination aware, versioned, revocable and auditable. Revocation blocks future access immediately when evaluated.

## 6. Child and family data

Use minimum necessary data. Cross-product child-data transfer must be purpose-limited and authorized. PEOS stores identity and relationship facts, not unrestricted educational, developmental or family narrative content.

## 7. Audit and governance

Sensitive identity, authorization, consent, membership and entitlement decisions must be auditable. Audit events must identify actor, action, target/context, outcome, policy or contract version where applicable, and timestamp.

## 8. Architecture

Start as a modular monolith with PostgreSQL and explicit domain boundaries. External contracts are versioned. Runtime input is validated. Database migrations are checksum-controlled and repeatable.

No hidden cross-domain writes. No hardcoded secrets. No synthetic production identities. No authorization fallback that grants access when PEOS data is unavailable.

## 9. Engineering gates

Production changes require typecheck, lint, unit/integration tests, production build and database migration verification. Foundation work is not considered complete until CI proves these gates.

## 10. PSG boundary

PEOS is a PSG shared platform. PSG AI Platform owns model, agent, tool, retrieval, memory, prompt, evaluation, safety, usage and AI observability infrastructure. SpaceCase, Atlas HDOS, Sentinel OS, Finality OS and future products remain independently deployable consumers of PEOS.
