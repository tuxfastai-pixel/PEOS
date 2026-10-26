# Family invitation link recovery

Expose optional validated learnerPersonId on the current-admin, school-scoped paginated list and POST on /v1/admin/schools/:schoolId/family-invitations/:invitationId for a replacement token.

This is a replacement, not retrieval or sending. Authenticate, assert current school admin, lock the school-matching invitation, require ISSUED and unexpired, recheck original issuer and learner authority, generate a random 32-byte URL-safe token, atomically replace only its hash with an expiry predicate, and audit without token/email metadata. Return id/email/unchanged expiry/token/NOT_SENT only to the authorized initiator. Preserve created_by to retain original review independence and current issuer checks. Claimed/confirmed/ended invitations cannot rotate. Existing claim/review/withdrawal row locks serialize against rotation. No schema change, raw token persistence, role grants, email worker, provider setup or consent changes.

SpaceCase sprint 057 consumes this contract for explicit manual copy/email/WhatsApp drafts. Green CLAIMED is pending school review; blue CONFIRMED is a school contact, not legal guardianship or learner-record access.

Tests cover rotation/old token invalidation, unchanged expiry, wrong school/admin, claimed/confirmed/expired/ended-issuer denial and learner-filter isolation. Local PostgreSQL integration skips without isolated CI DB; full CI is required before release. Actual intended-parent acceptance/review and external composer operation remain live pilot checks.
