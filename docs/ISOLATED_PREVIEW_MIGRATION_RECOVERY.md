# Isolated PEOS preview migration recovery

The Neon preview project is `bold-sky-98466908`, database `peos_preview`. Never use a production connection string.

The preview schema was installed manually, before `audit.schema_migrations` was created. Do not run `npm run db:migrate` against this database until its history has been reconciled: non-idempotent SQL would otherwise be replayed.

1. Take a recovery snapshot (created: `snap-shy-scene-banzoluc`).
2. List every SQL file under `db/migrations` at the checked-out commit. Compare each migration's complete effects to the preview database, including constraints, indexes, role seeds, RLS and privileges.
3. Only for fully verified migrations, insert the original filename and SHA-256 of its unmodified UTF-8 contents into `audit.schema_migrations`. Never mark an incomplete migration applied.
4. Run `npm run db:migrate` with the isolated preview `DATABASE_URL`, then rerun to verify no-op behavior and exact history count.
5. After a clean replay, connect the isolated database to the preview deployment and test synthetic principal, admin, finance and teacher roles.

The disposable CI database is independent of the preview database. Keep finance off, both PRs unmerged and production untouched until signed-in acceptance and release approval.
