import type { AccessContext } from "@/server/access";

type ExperimentRow = {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  status: string;
  record_version: number;
  sample_size: number;
  confidence: string;
  updated_at: string;
  archived_at: string | null;
  version_id: string;
  version_number: number;
  problem: string;
  primary_user: string;
  inputs_json: string;
  ai_task: string;
  proposed_action: string;
  approval_required: string;
  success_metric: string;
  risk: string;
  verification_method: string;
};

type VersionRow = {
  experiment_id: string;
  version_number: number;
  change_note: string;
  created_at: string;
};

export async function listExperiments(context: AccessContext) {
  const rows = await context.db
    .prepare(
      `SELECT
        e.id, e.organization_id, e.code, e.title, e.status, e.record_version,
        e.sample_size, e.confidence, e.updated_at, e.archived_at,
        v.id AS version_id, v.version_number, v.problem, v.primary_user,
        v.inputs_json, v.ai_task, v.proposed_action, v.approval_required,
        v.success_metric, v.risk, v.verification_method
      FROM experiments e
      JOIN experiment_versions v ON v.id = e.current_version_id
      WHERE e.organization_id = ?
        AND e.deleted_at IS NULL
        AND (? != 'viewer' OR e.status = 'Published')
      ORDER BY e.updated_at DESC, e.code DESC`,
    )
    .bind(context.organization.id, context.role)
    .all<ExperimentRow>();

  const versions = await context.db
    .prepare(
      `SELECT experiment_id, version_number, change_note, created_at
       FROM experiment_versions
       WHERE organization_id = ?
       ORDER BY experiment_id, version_number DESC`,
    )
    .bind(context.organization.id)
    .all<VersionRow>();

  const byExperiment = new Map<string, VersionRow[]>();
  for (const version of versions.results) {
    const current = byExperiment.get(version.experiment_id) ?? [];
    current.push(version);
    byExperiment.set(version.experiment_id, current);
  }

  return rows.results.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    title: row.title,
    problem: row.problem,
    user: row.primary_user,
    input: parseInputs(row.inputs_json),
    task: row.ai_task,
    action: row.proposed_action,
    approval: row.approval_required,
    metric: row.success_metric,
    risk: row.risk,
    verification: row.verification_method,
    status: row.status,
    sampleSize: row.sample_size,
    confidence: row.confidence,
    updated: row.updated_at,
    recordVersion: row.record_version,
    currentVersionId: row.version_id,
    archivedAt: row.archived_at,
    versions: (byExperiment.get(row.id) ?? []).map((version) => ({
      version: version.version_number,
      note: version.change_note,
      date: version.created_at,
    })),
  }));
}

function parseInputs(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return value;
  }
}
