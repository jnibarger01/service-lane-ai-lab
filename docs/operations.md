# Service Lane AI Lab foundation operations

## Scope

This runbook covers the persistent multi-tenant foundation introduced before
any DMS, ACS execution, or external communication integration.

## Database migrations

1. Change `db/schema.ts`.
2. Run `npm run db:generate`.
3. Inspect every generated SQL statement and the Drizzle snapshot.
4. Validate the migration against a fresh local D1 database.
5. Deploy the application and migration together. Never edit an applied
   migration.

Schema changes must remain backward compatible with the currently deployed
application. Destructive changes use an expand-and-contract sequence.

## Bootstrap and membership

The first authenticated user may bootstrap the first organization only when the
database contains zero users. That user receives the `administrator` role.
After bootstrap, unknown users fail closed until an administrator creates an
explicit organization membership.

Sites access policy remains the outer workspace boundary. API authorization
remains the authoritative application boundary.

## Backup

An administrator can retrieve a tenant-scoped JSON export from `/api/export`.
The export contains a schema version, export timestamp, organization identity,
and all foundation records. Store exports in an encrypted, access-controlled
location outside the application.

Before a deployment containing a data migration:

1. Generate a fresh organization export.
2. Record the deployed application version and migration identifiers.
3. Verify the export can be parsed and contains record counts for every table.
4. Retain the previous deployable version until migration validation completes.

## Restore

Automated in-product restore is intentionally disabled in this phase because it
could overwrite authoritative records. Restoration is an operator-controlled
procedure:

1. Create a new empty D1 database in a non-production environment.
2. Apply the exact migration set referenced by the export schema version.
3. Validate organization IDs, foreign keys, hashes, and record counts.
4. Import records in dependency order: users and organizations, memberships,
   experiments and versions, repair orders, runs, evidence, results, approvals,
   verification results, and audit events.
5. Run tenant-isolation and referential-integrity checks.
6. Promote the recovered database binding only after an authorized operator
   approves the recovery report.

Never restore directly over the production database.

## Archival and deletion

Experiments and repair orders use `archived_at` and `deleted_at`. Application
routes do not physically delete these records. Hard deletion is an explicit
operator-only retention task and is not exposed in the pilot UI.

## Incident rollback

If authorization or tenant isolation fails:

1. Suspend the site through the hosting access policy.
2. Preserve logs and the latest tenant export.
3. Roll back to the last known-good application version.
4. Do not re-enable access until cross-tenant tests and audit reconstruction
   pass.
