# School family invitation contract v1

Status: implemented for review; no production migration or activation.

PEOS owns this school-scoped invitation and school-confirmed contact relationship. SpaceCase must consume the API, never access these tables. This is not a declaration of global/legal guardianship. No new staff role, school membership, learning-record access, Atlas permission or consent grant is created.

Flow: current school administrator selects a currently registered active learner and intended email/relationship (PARENT, GUARDIAN, CAREGIVER). Creation returns one opaque 32-byte token; only its hash is stored. Automatic delivery remains NOT_SENT. Parent signs in and explicitly acknowledges the school review request. The existing verifiedRecipient adapter validates the external identity and confirmed email and binds it to the PEOS session person; client-submitted email is never trusted. Claim is idempotent only for the same canonical person, discloses school name/status only, and creates no link. A different current administrator must verify offline evidence before confirming; the review request requires verifiedBySchool:true. Confirmation creates a PEOS school-scoped contact relationship, with provenance, not a product access grant. Revoke invalidates both invitation and relationship atomically.

API:
- GET/POST /v1/admin/schools/:schoolId/family-invitations
- PATCH /v1/admin/schools/:schoolId/family-invitations/:invitationId
- POST /v1/family/invitations/claim (PEOS bearer session plus x-psg-identity-token)

Input is strict and bounded. Parent acknowledgement is explicit. Tokens never go into URLs at this API or audit. School and learner identity originate in the authorized school register. Expired, revoked, inactive-school, inactive-learner, revoked-issuer and wrong-recipient requests fail closed. Concurrent claims serialize; duplicate pending creation serializes; independent review prohibits self-confirmation. Audit stores action and IDs, no tokens/emails/names/medical notes. Parent-facing responses reveal no learner IDs, names, roster or photos before verification.

No SpaceCase draft, home address, photo or medical note is transferred by this contract. Future draft submission must be separate, consented, revision-bound and narrowly scoped, with medical information separately acknowledged. Private family drafts remain preparatory data.

Security/release: RLS enabled and PUBLIC privileges revoked on both tables. Existing server role strategy is unchanged; no browser table access or new credentials. Migration must be tested on an isolated production-schema branch and privilege-checked before explicitly approved production activation. CI must pass migration, unit/integration tests, typecheck/lint/build. Product UI/adapters must not advertise success until this service release is verified. Reconnection/revocation tests are required before exposing any future parent learning-record surface.
