import { isRole, normalizeEmail } from "@/lib/foundation";
import {
  errorResponse,
  requestIdFor,
  requireAccess,
  requireSafeMutationRequest,
} from "@/server/access";

export const dynamic = "force-dynamic";

type MemberWrite = {
  email?: string;
  displayName?: string;
  role?: string;
  revoked?: boolean;
};

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const context = await requireAccess("organization:manage", requestId);
    const members = await context.db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.status, m.role,
                m.created_at, m.updated_at, m.revoked_at
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = ?
         ORDER BY u.email ASC`,
      )
      .bind(context.organization.id)
      .all();
    return Response.json({ members: members.results });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("organization:manage", requestId);
    const payload = (await request.json()) as MemberWrite;
    const email = normalizeEmail(payload.email ?? "");
    const displayName = payload.displayName?.trim() ?? "";
    if (!email || !email.includes("@") || email.length > 320) {
      return Response.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!displayName || displayName.length > 160) {
      return Response.json({ error: "A display name is required" }, { status: 400 });
    }
    if (!payload.role || !isRole(payload.role)) {
      return Response.json({ error: "A valid role is required" }, { status: 400 });
    }

    const existingUser = await context.db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    const userId = existingUser?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const auditId = crypto.randomUUID();
    await context.db.batch([
      context.db
        .prepare(
          `INSERT INTO users (id, email, display_name, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             display_name = excluded.display_name,
             status = 'active',
             deleted_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .bind(userId, email, displayName, now, now),
      context.db
        .prepare(
          `INSERT INTO organization_memberships
            (organization_id, user_id, role, created_at, updated_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT(organization_id, user_id) DO UPDATE SET
             role = excluded.role,
             updated_at = excluded.updated_at,
             revoked_at = NULL`,
        )
        .bind(context.organization.id, userId, payload.role, now, now),
      context.db
        .prepare(
          `INSERT INTO audit_events
            (id, organization_id, actor_user_id, entity_type, entity_id,
             action, request_id, metadata_json, created_at)
           VALUES (?, ?, ?, 'organization_membership', ?, 'membership.upserted', ?, ?, ?)`,
        )
        .bind(
          auditId,
          context.organization.id,
          context.user.id,
          userId,
          context.requestId,
          JSON.stringify({ role: payload.role }),
          now,
        ),
    ]);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const context = await requireAccess("organization:manage", requestId);
    const payload = (await request.json()) as MemberWrite;
    const email = normalizeEmail(payload.email ?? "");
    if (!email || email === context.user.email) {
      return Response.json(
        { error: "Administrators cannot revoke or change their own role here" },
        { status: 400 },
      );
    }
    if (!payload.revoked && (!payload.role || !isRole(payload.role))) {
      return Response.json({ error: "A valid role is required" }, { status: 400 });
    }
    const member = await context.db
      .prepare(
        `SELECT u.id
         FROM users u
         JOIN organization_memberships m ON m.user_id = u.id
         WHERE u.email = ? AND m.organization_id = ?`,
      )
      .bind(email, context.organization.id)
      .first<{ id: string }>();
    if (!member) return Response.json({ error: "Member not found" }, { status: 404 });

    const now = new Date().toISOString();
    const results = await context.db.batch([
      context.db
        .prepare(
          `UPDATE organization_memberships
           SET role = COALESCE(?, role), revoked_at = ?, updated_at = ?
           WHERE organization_id = ? AND user_id = ?`,
        )
        .bind(
          payload.revoked ? null : payload.role,
          payload.revoked ? now : null,
          now,
          context.organization.id,
          member.id,
        ),
      context.db
        .prepare(
          `INSERT INTO audit_events
            (id, organization_id, actor_user_id, entity_type, entity_id,
             action, request_id, metadata_json, created_at)
           VALUES (?, ?, ?, 'organization_membership', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          context.organization.id,
          context.user.id,
          member.id,
          payload.revoked ? "membership.revoked" : "membership.role_changed",
          context.requestId,
          JSON.stringify({ role: payload.revoked ? null : payload.role }),
          now,
        ),
    ]);
    if ((results[0].meta.changes ?? 0) !== 1) {
      return Response.json({ error: "Membership update failed" }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
