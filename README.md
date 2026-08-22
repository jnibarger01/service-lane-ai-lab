# Service Lane AI Lab

A governed automotive service-lane experimentation workspace for testing AI-assisted workflows before they reach customers or operational systems.

The application helps service teams define experiments, review evidence, simulate approval boundaries, explore use cases, and estimate operational value. Its current persistent foundation uses Cloudflare D1 through ChatGPT Sites and enforces organization-scoped access on the server.

## Current capabilities

- Create and version governed service-lane experiments
- Track status, confidence, sample size, risk, success metrics, and verification methods
- Run a sample repair-order workflow with evidence and approval gates
- Explore advisor, technician, management, and warranty workflow candidates
- Review operational scenarios and required stop conditions
- Compare workflow timing and estimate ROI
- Persist tenant-scoped records with optimistic concurrency and soft deletion
- Export organization data as JSON
- Enforce authenticated, role-based access on API routes

## Stack

- React 19 and Next.js-compatible routing
- Vinext and Vite
- Cloudflare Workers and D1
- Drizzle ORM
- TypeScript, Node.js test runner, and ESLint

## Prerequisites

- Node.js 22.13 or newer
- npm
- Linux or WSL for the included lifecycle scripts (`flock` and GNU `timeout` are required)

## Local setup

```bash
npm ci
npm run dev
```

The D1 binding is declared as `DB` in `.openai/hosting.json` and simulated locally through `vite.config.ts`.

## Verification

```bash
npm run lint
npm test
```

Useful targeted commands:

```bash
npm run build
npm run test:foundation
npm run validate:artifact
```

`npm run build` creates and validates the deployable Cloudflare Worker artifact.

## Database changes

The authoritative schema is in `db/schema.ts`. To generate a migration:

```bash
npm run db:generate
```

Inspect generated SQL and Drizzle metadata before deployment. Never edit an applied migration. Use backward-compatible expand-and-contract changes for destructive schema work.

## Project structure

```text
app/                 UI and API routes
db/                  D1 connection and Drizzle schema
drizzle/             SQL migrations and schema metadata
server/              Authorization and domain services
lib/                 Shared domain contracts
tests/               Foundation, migration, and rendered-output tests
docs/operations.md   Backup, restore, migration, and incident procedures
scripts/             Install, build, and artifact-validation scripts
```

## Authentication and authorization

ChatGPT Sites supplies authenticated identity headers. `server/access.ts` resolves the user, organization membership, role, and permissions. API routes must call the server-side access checks; client-side visibility is not an authorization boundary.

The first authenticated user may bootstrap the first organization only while the database contains no users. After bootstrap, unknown users fail closed until an administrator creates an explicit membership.

## Data and safety boundaries

- Sites access policy is the outer boundary; API authorization is authoritative.
- Records are organization-scoped.
- Experiment updates use record versions for optimistic concurrency.
- Application routes archive or soft-delete records rather than physically deleting them.
- The pilot does not directly execute DMS, ACS, customer-communication, or repair actions.
- Approval gates and evidence requirements must remain explicit for future integrations.
- Do not commit customer information, credentials, local databases, exports, or environment files.

See [docs/operations.md](docs/operations.md) for backup, restore, migration, archival, and incident-response procedures.

## Deployment

This repository retains `.openai/hosting.json` so it can remain associated with its ChatGPT Sites project. Deployments should use the Sites lifecycle so source, migrations, the Worker artifact, and hosting bindings stay synchronized.

Pushing this source to GitHub does not automatically redeploy the existing `chatgpt.site` application. Configure separate CI/CD only if you intentionally want another hosting environment and have recreated the required D1 and identity integrations.

## License

No open-source license has been granted. All rights reserved unless a license is added later.
