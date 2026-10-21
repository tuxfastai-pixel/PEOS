# Verified identity self-signup

Opt-in `PEOS_ALLOW_SELF_SIGNUP=true` allows the configured OIDC issuer to provision a basic person/account/credential identity after signature, issuer, audience and expiry verification. It additionally requires signed `role=authenticated` and `is_anonymous=false` claims. Default remains false.

No email linking or user-metadata authorization is performed. A transaction and provider/subject advisory lock prevent duplicate people on parallel first logins. Existing locked accounts or inactive people cannot be recreated. Audit insertion is in the same transaction. No school authority, consent, product membership or entitlement is created. Existing session introspection and revocation continue to apply.

This is independent of Google OAuth credentials: configure Google in Supabase and configure PEOS to trust Supabase-issued access tokens, not Google's OAuth client ID.
