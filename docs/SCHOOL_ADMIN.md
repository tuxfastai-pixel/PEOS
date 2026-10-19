# School-scoped administration and invitations

## Scope and acceptance

An authenticated active staff member with a current SCHOOL_ADMINISTRATOR or PRINCIPAL role can list their administered schools, rename a school, and create/list/revoke staff invitations for that school. Authority is checked on every operation; an administrator in school A cannot manage school B. A founder is bootstrapped into an explicitly chosen pilot school, not a global superuser role.

PEOS owns organisations, staff memberships, roles and invitations. SpaceCase supplies the interface through a server-side proxy and its existing PEOS session. Product learning records and class assignments are unchanged.

Invitations use random 256-bit tokens, SHA-256 hashes in the database, a seven-day expiry and single-use acceptance. The browser link uses a fragment, which is removed and stored in a short-lived HttpOnly cookie before Google sign-in. The callback returns to the invitation confirmation screen. No email or identity is placed in the link. No messages are sent by this feature.

Acceptance requires an active PEOS session, a valid external JWT bound to the same PEOS person, and fresh Supabase /user verification with confirmed, non-anonymous email matching the invitation. User-editable metadata is not an authority source. Acceptance and membership/role assignment occur in one locked transaction. A revoked or expired invitation, or an invitation from an administrator whose authority has ended, is rejected. Teacher acceptance grants no class assignment, learner access, subscription or cross-product consent. Creation, rename, revocation and acceptance are audited; authenticated denials are audited without raw invitation tokens or email addresses.

## Configuration and rollout

Apply the generated staff_invitations migration through the controlled migration process before releasing the endpoints. Set PEOS SUPABASE_PUBLISHABLE_KEY for the already configured Supabase Auth issuer. No service-role key is required. Google remains the configured sign-in provider.

Verify isolated CI database coverage for cross-school denial, wrong recipient, replay, expiration, revocation, concurrent creation and issuer authority revocation. Bootstrap only a verified owner identity with explicit school-scoped administration. Verify founder login reaches SpaceCase /admin and general signups do not. End-to-end acceptance needs a real invited participant's Google login.

## Delivery disabled and replacement links

Creation and replacement return delivery={mode:MANUAL,emailEnabled:false,status:NOT_SENT,reason:DELIVERY_NOT_CONFIGURED}. GET invitations includes the same policy and per-row emailStatus=NOT_SENT. These are derived facts of the disabled release, not stored delivery events. domains/notifications/invitationDelivery.ts defines a transport port with an offline implementation; no secrets, provider, queue or outbound messages are used. An environment flag cannot turn it on.

POST /v1/admin/schools/[schoolId]/invitations/[invitationId] rotates a pending token under a row lock and audits school.invitation.replace_link. The current administrator and original issuer must both still have school authority. The old token stops working; expiry, issuer, email and role are preserved. Accepted, expired or revoked invitations cannot be replaced. The new token is shown once and stored only as a hash. No new migration is needed.

Future email activation requires provider/domain configuration, persisted attempts, idempotency, throttling, signed delivery-event verification, secure queue/secret lifecycle and failure tests. SUBMITTED is provider acceptance, not proof of delivery. Installing a provider must not automatically send existing pending invitations.

## Bulk invitations

POST /v1/admin/schools/[schoolId]/invitations/bulk accepts a strict recipients array of 1–50 normalized email/role pairs. Only TEACHER and SCHOOL_ADMINISTRATOR are accepted; duplicate emails reject the entire payload before writes. Four workers create independently audited invitations, rechecking authority in every recipient transaction. Results preserve input order and include recipient email and role plus CREATED (one-time token, id, expiry, NOT_SENT), SKIPPED (pending invitation or current school member), or FAILED (authority ended or service unavailable). Delivery remains MANUAL/disabled; no outbound email is attempted.

Current staff detection uses an accepted invitation at the same email joined to an active person and current STAFF membership. This avoids changing existing staff roles in bulk. It is deliberately not a general email identity resolver: bootstrapped staff or staff using an unrecorded email may not be detected, and email matching never grants authority. Single invitation behavior is unchanged.

A per-school/email transaction advisory lock prevents concurrent pending duplicates and makes repeated batches skip existing pending rows. Unknown service/commit outcomes or lost responses require checking the latest Invitations list and replacing links whose one-time tokens were lost. There is no automatic retry. Audit denials contain bounded reasons, not recipient emails/tokens. An audit outage can make the batch response unavailable after other recipients committed. Listing returns at most the latest 200 invitations. No migration is needed.

SpaceCase handles local paste/CSV review, exclusions, privilege acknowledgement, per-person copy/draft actions and optional private CSV export. It does not send the batch. Future onboarding can reuse that interface. Integration coverage uses isolated CI fixtures, never production invitees.
