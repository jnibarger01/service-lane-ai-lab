import type { AccessContext } from "@/server/access";

export type RunReport = {
  id: string;
  experimentId: string;
  code: string;
  title: string;
  sampleSize: number;
  confidence: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  metrics: Record<string, number>;
  evidence: { total: number; verified: number; pending: number };
};

export type ComparisonInput = { left: RunReport; right: RunReport };
export type MetricDelta = { metric: string; left: number; right: number; delta: number; direction: "improved" | "declined" | "unchanged" };

export function buildComparisonReport(input: ComparisonInput) {
  const names = [...new Set([...Object.keys(input.left.metrics), ...Object.keys(input.right.metrics)])].sort();
  const metricDeltas: MetricDelta[] = names.map((metric) => {
    const left = input.left.metrics[metric] ?? 0;
    const right = input.right.metrics[metric] ?? 0;
    const delta = right - left;
    return { metric, left, right, delta, direction: delta < 0 ? "improved" : delta > 0 ? "improved" : "unchanged" };
  });
  return {
    left: input.left,
    right: input.right,
    metricDeltas,
    evidenceSummary: { left: input.left.evidence, right: input.right.evidence },
  };
}

type TimelineRun = { id: string; status: string; correlationId: string; startedAt: string; completedAt: string | null; modelName: string | null };
type TimelineEvidence = { id: string; claim: string; source: string; confidence: string; verificationStatus: string; createdAt: string };
export type TimelineInput = { run: TimelineRun; evidence: TimelineEvidence[]; result: { resultHash: string; workerReference: string; payload: unknown } | null };

export function buildEvidenceTimeline(input: TimelineInput) {
  const events = [
    { type: "run.started" as const, at: input.run.startedAt, status: input.run.status },
    ...[...input.evidence].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((item) => ({ type: "evidence.created" as const, at: item.createdAt, evidenceId: item.id, claim: item.claim, source: item.source, confidence: item.confidence, verificationStatus: item.verificationStatus })),
    ...(input.run.completedAt ? [{ type: "run.completed" as const, at: input.run.completedAt, status: input.run.status }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return { run: input.run, events, result: input.result };
}

type RunRow = { run_id: string; experiment_id: string; code: string; title: string; sample_size: number; confidence: string; status: string; started_at: string; completed_at: string | null; correlation_id: string; model_name: string | null; result_payload_json: string | null; evidence_total: number; evidence_verified: number; evidence_pending: number };

export async function loadRunReport(context: AccessContext, experimentId: string, runId?: string) {
  const row = await context.db.prepare(`SELECT r.id AS run_id, e.id AS experiment_id, e.code, e.title, e.sample_size, e.confidence, r.status, r.started_at, r.completed_at, r.correlation_id, r.model_name, wr.result_payload_json, COUNT(ei.id) AS evidence_total, SUM(CASE WHEN ei.verification_status IN ('verified','source_matched_action_held') THEN 1 ELSE 0 END) AS evidence_verified, SUM(CASE WHEN ei.verification_status NOT IN ('verified','source_matched_action_held') THEN 1 ELSE 0 END) AS evidence_pending
    FROM experiments e JOIN experiment_versions v ON v.experiment_id = e.id JOIN workflow_runs r ON r.experiment_version_id = v.id
    LEFT JOIN workflow_results wr ON wr.workflow_run_id = r.id LEFT JOIN evidence_items ei ON ei.workflow_run_id = r.id
    WHERE e.organization_id = ? AND e.id = ? AND e.deleted_at IS NULL ${runId ? "AND r.id = ?" : ""}
    GROUP BY r.id ORDER BY r.started_at DESC LIMIT 1`).bind(...(runId ? [context.organization.id, experimentId, runId] : [context.organization.id, experimentId])).first<RunRow>();
  if (!row) return null;
  const payload = parseObject(row.result_payload_json);
  const metrics = extractMetrics(payload, row);
  return { id: row.run_id, experimentId: row.experiment_id, code: row.code, title: row.title, sampleSize: row.sample_size, confidence: row.confidence, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, metrics, evidence: { total: Number(row.evidence_total ?? 0), verified: Number(row.evidence_verified ?? 0), pending: Number(row.evidence_pending ?? 0) } } satisfies RunReport;
}

export async function getComparisonReport(context: AccessContext, leftExperimentId: string, rightExperimentId: string, leftRunId?: string, rightRunId?: string) {
  const [left, right] = await Promise.all([loadRunReport(context, leftExperimentId, leftRunId), loadRunReport(context, rightExperimentId, rightRunId)]);
  if (!left || !right) return null;
  return buildComparisonReport({ left, right });
}

export async function getEvidenceTimeline(context: AccessContext, experimentId: string, runId: string) {
  const run = await context.db.prepare(`SELECT r.id, r.status, r.correlation_id, r.started_at, r.completed_at, r.model_name FROM workflow_runs r JOIN experiment_versions v ON v.id = r.experiment_version_id JOIN experiments e ON e.id = v.experiment_id WHERE r.id = ? AND e.id = ? AND r.organization_id = ? AND e.organization_id = ? AND e.deleted_at IS NULL`).bind(runId, experimentId, context.organization.id, context.organization.id).first<TimelineRun & { correlation_id: string; started_at: string; completed_at: string | null; model_name: string | null }>();
  if (!run) return null;
  const evidence = await context.db.prepare(`SELECT id, claim, source_reference AS source, confidence, verification_status AS verificationStatus, created_at AS createdAt FROM evidence_items WHERE workflow_run_id = ? AND organization_id = ? ORDER BY created_at ASC, id ASC`).bind(runId, context.organization.id).all<TimelineEvidence>();
  const result = await context.db.prepare(`SELECT result_hash AS resultHash, worker_reference AS workerReference, result_payload_json AS payloadJson FROM workflow_results WHERE workflow_run_id = ? AND organization_id = ?`).bind(runId, context.organization.id).first<{ resultHash: string; workerReference: string; payloadJson: string }>();
  return buildEvidenceTimeline({ run: { id: run.id, status: run.status, correlationId: run.correlation_id, startedAt: run.started_at, completedAt: run.completed_at, modelName: run.model_name }, evidence: evidence.results, result: result ? { resultHash: result.resultHash, workerReference: result.workerReference, payload: parseObject(result.payloadJson) } : null });
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}
function extractMetrics(payload: Record<string, unknown>, row: RunRow) {
  const candidate = payload.metrics && typeof payload.metrics === "object" && !Array.isArray(payload.metrics) ? payload.metrics as Record<string, unknown> : payload;
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(candidate)) if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
  if (!Object.keys(metrics).length) metrics.sampleSize = row.sample_size;
  return metrics;
}
