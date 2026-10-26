# Invitation email delivery preparation

## Goal and current scope

Prepare a replaceable Resend transport and bounded retry policy without activating email delivery. The existing disabled transport remains the only production invitation dependency. No user route, worker, timer or environment variable imports the prepared adapter. No messages, credentials, provider account, domain, queue or database migration are provisioned by this change.

SpaceCase owns invitation copy; PEOS owns canonical invitation validity and shared delivery governance. The prepared adapter accepts one recipient and already-rendered plain text/HTML; it does not invent learner information or send evaluations. It uses the fixed Resend HTTPS endpoint, refuses redirects, bounds request time and validates inputs. Keys identify invitation and operation UUIDs and contain no address or token. Failed results expose fixed reason codes, never provider error bodies, recipients, message contents or credentials.

## Retry and outcome contract

SUBMITTED records provider API acceptance only, never mailbox delivery or reading. A provider message UUID is returned for a future durable attempt ledger. Transient failures use RETRYABLE with a fixed reason; rejected requests, bad credentials, quota exhaustion and idempotency conflicts stop for review. A network failure is uncertain: the provider may have accepted the message. Retrying must reuse the exact immutable payload and operation key. Never rotate a token, edit the payload or generate a new key automatically to bypass an uncertain result.

The retry planner produces a next-attempt time rather than sleeping or sending. It backs off from one minute, respects a longer provider Retry-After, caps at five attempts, and stops within 23 hours of the first attempt. This deliberately leaves margin inside Resend's documented 24-hour deduplication window. Terminal results stop. Invalid history or expired retry windows require review. Quota exhaustion never initiates an upgrade or payment.

## Activation work still required

1. Choose and verify the sender/domain with the provider. Configure a least-privilege server-side key through the hosting secret manager; never through chat, browser code or logs.
2. Add a reviewed durable outbox with authenticated encryption of the exact recipient/body/link payload, versioned key management, payload digest, immutable operation key and bounded retention. Invitation tokens currently exist only at creation/replacement, so old pending invitations must not be swept into email delivery. Use a new explicit administrator send action.
3. Enforce school and recipient rate limits and a global budget before enqueue, including bulk batches. Resolve each recipient from the authorized canonical invitation, rather than accepting a caller-supplied target. Do not grant an agent independent recipient discovery or sending authority.
4. Add a leased dispatcher with compare-and-set attempt records. Before every submission, recheck invitation state, token hash/version, expiry, school, issuer and requester authority. Cancellation, rotation, acceptance, claim and revocation must invalidate queued work. Do not hold database locks across external network calls; document the in-flight revocation boundary honestly.
5. Persist fixed attempt results and scheduling decisions. After a crash or timeout, reuse the immutable operation key within the deadline. Stop uncertain jobs after the deadline for reconciliation, with no automatic fresh-key retry.
6. Verify provider-signed webhook bodies before recording deduplicated delivery/bounce/complaint events. Do not expose a public unsigned webhook or mark messages delivered from a successful send response. Reconcile events that arrive before a submission record.
7. Add school-scoped delivery status and manual retry/cancel controls, accurate bulk summaries and copy-link fallback. No client may toggle provider activation.
8. Run synthetic end-to-end tests for scope isolation, concurrency, rotated/revoked/expired links, bounded retries, crash recovery, duplicate/out-of-order events and log privacy. Activate only the reviewed sender/configuration and send explicit approved test recipients first.

## Acceptance evidence

Local and CI tests must verify fixed endpoint/recipient, stable request payload/key, timeout/redirect controls, rejection before transmission, private fixed error reasons, distinct quota/rate failures, retry limits and deadlines. Existing disabled-transport regression must keep passing. Production invitation flows continue returning NOT_SENT.

Official references checked 26 October 2026:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/errors
- https://resend.com/docs/dashboard/emails/idempotency-keys
