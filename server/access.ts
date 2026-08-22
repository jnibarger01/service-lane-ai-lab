import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import {
  isRole,
  normalizeEmail,
  permissionsForRole,
  roleCan,
  type Permission,
  type Role,
} from "@/lib/foundation";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AccessContext = {
  db: D1Database;
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string; slug: string };
  role: Role;
  permissions: readonly Permission[];
  requestId: string;
};

type MembershipRow = {
  user_id: string;
  email: string;
  display_name: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
};

export async function requireAccess(
  permission: Permission,
  requestId = crypto.randomUUID(),
): Promise<AccessContext> {
  const identity = await getChatGPTUser();
  if (!identity) throw new HttpError(401, "Authentication required");

  const db = getD1();
  const email = normalizeEmail(identity.email);
  let row = await findMembership(db, email);

  if (!row) {
    const userCount = await db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL")
      .first<{ count: number }>();
    if ((userCount?.count ?? 0) !== 0) {
      throw new HttpError(403, "No active organization membership");
    }
    await bootstrapFirstAdministrator(db, {
      email,
      displayName: identity.displayName,
      requestId,
    });
    row = await findMembership(db, email);
  }

  if (!row || !isRole(row.role)) {
    throw new HttpError(403, "No valid organization role");
  }
  if (!roleCan(row.role, permission)) {
    throw new HttpError(403, "Role is not authorized for this action");
  }

  return {
    db,
    user: { id: row.user_id, email: row.email, displayName: row.display_name },
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      slug: row.organization_slug,
    },
    role: row.role,
    permissions: permissionsForRole(row.role),
    requestId,
  };
}

async function findMembership(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT
        u.id AS user_id,
        u.email,
        u.display_name,
        o.id AS organization_id,
        o.name AS organization_name,
        o.slug AS organization_slug,
        m.role
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.organization_id
      WHERE u.email = ?
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND m.revoked_at IS NULL
        AND o.archived_at IS NULL
      ORDER BY m.created_at ASC
      LIMIT 1`,
    )
    .bind(email)
    .first<MembershipRow>();
}

async function bootstrapFirstAdministrator(
  db: D1Database,
  input: { email: string; displayName: string; requestId: string },
) {
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO users (id, email, display_name, status) VALUES (?, ?, ?, 'active')",
      )
      .bind(userId, input.email, input.displayName),
    db
      .prepare(
        "INSERT INTO organizations (id, name, slug) VALUES (?, 'Service Lane AI Lab', 'service-lane-ai-lab')",
      )
      .bind(organizationId),
    db
      .prepare(
        "INSERT INTO organization_memberships (organization_id, user_id, role) VALUES (?, ?, 'administrator')",
      )
      .bind(organizationId, userId),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, actor_user_id, entity_type, entity_id, action, request_id, metadata_json)
         VALUES (?, ?, ?, 'organization', ?, 'organization.bootstrapped', ?, ?)`,
      )
      .bind(
        auditId,
        organizationId,
        userId,
        organizationId,
        input.requestId,
        JSON.stringify({ role: "administrator" }),
      ),
  ]);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (message.includes("no such table")) {
    return Response.json(
      { error: "Database migration is not available yet" },
      { status: 503 },
    );
  }
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export function requireSafeMutationRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    throw new HttpError(413, "Request body is too large");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new HttpError(403, "Cross-site mutation is not allowed");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Request origin is not allowed");
  }
}
