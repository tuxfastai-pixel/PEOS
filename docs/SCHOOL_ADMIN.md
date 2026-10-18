# School-scoped administration and invitations

## Scope and acceptance

An authenticated active staff member with a current SCHOOL_ADMINISTRATOR or PRINCIPAL role can list their administered schools, rename a school, and create/list/revoke staff invitations for that school. Authority is checked on every operation; an administrator in school A cannot manage school B. A founder is bootstrapped into an explicitly chosen pilot school, not a global superuser role.

PEOS owns organisations, staff memberships, roles and invitations. SpaceCase supplies the interface through a server-side proxy and its existing PEOS session. Product learning records and class assignments are unchanged.

Invitations use random 256-bit tokens, SHA-256 hashes in the database, a seven-day expiry and single-use acceptance. The browser link uses a fragment, which is removed and stored in a short-lived HttpOnly cookie before Google sign-in. The callback returns to the invitation confirmation screen. No email or identity is placed in the link. No messages are sent by this feature.

Acceptance requires an active PEOS session, a valid external JWT bound to the same PEOS person, and fresh Supabase /user verification with confirmed, non-anonymous email matching the invitation. User-editable metadata is not an authority source. Acceptance and membership/role assignment occur in one locked transaction. A revoked or expired invitation, or an invitation from an administrator whose authority has ended, is rejected. Teacher acceptance grants no class assignment, learner access, subscription or cross-product consent. Creation, rename, revocation and acceptance are audited; authenticated denials are audited without raw invitation tokens or email addresses.

## Configuration and rollout

Apply the generated staff_invitations migration through the controlled migration process before releasing the endpoints. Set PEOS SUPABASE_PUBLISHABLE_KEY for the already configured Supabase Auth issuer. No service-role key is required. Google remains the configured sign-in provider.

Verify isolated CI database coverage for cross-school denial, wrong recipient, replay, expiration, revocation, concurrent creation and issuer authority revocation. Bootstrap only a verified owner identity with explicit school-scoped administration. Verify founder login reaches SpaceCase /admin and general signups do not. End-to-end acceptance needs a real invited participant's Google login.
