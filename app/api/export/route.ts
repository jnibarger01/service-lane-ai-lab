import { errorResponse, requireAccess } from "@/server/access";

export const dynamic = "force-dynamic";

const exportTables = [
  "experiments",
  "experiment_versions",
  "repair_orders",
  "workflow_runs",
  "evidence_items",
  "workflow_results",
  "approval_requests",
  "verification_results",
  "audit_events",
] as const;

export async function GET() {
  try {
    const context = await requireAccess("organization:manage");
    const records: Record<string, unknown[]> = {};
    for (const table of exportTables) {
      const result = await context.db
        .prepare(`SELECT * FROM ${table} WHERE organization_id = ? ORDER BY rowid ASC`)
        .bind(context.organization.id)
        .all();
      records[table] = result.results;
    }
    return Response.json({
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      organization: context.organization,
      records,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
