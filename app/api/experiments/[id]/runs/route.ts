import {
  errorResponse,
  errorJson,
  requestIdFor,
  requireAccess,
  requireSafeMutationRequest,
} from "@/server/access";
import { listExperiments } from "@/server/experiments";
import { buildDeterministicEvaluation } from "@/lib/experiment-evaluation";
import {
  ensureSampleRepairOrder,
  sha256,
} from "@/server/sample-repair-order";
import { ConcurrencyError, MissingExperimentError } from "@/server/write-experiment";

export const dynamic = "force-dynamic";

type CurrentExperiment = {
  record_version: number;
  title: string;
  status: string;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFor(request);
  try {
    requireSafeMutationRequest(request);
    const payload = (await request.json()) as { expectedVersion?: number };
    if (!Number.isInteger(payload.expectedVersion)) {
      return errorJson("expectedVersion is required", 400, requestId);
    }
    const context = await requireAccess("experiments:update", requestId);
    const { id: experimentId } = await params;
    const current = await context.db
      .prepare(
        `SELECT
          e.record_version, e.title, e.status, v.version_number, v.problem,
          v.primary_user, v.inputs_json, v.ai_task, v.proposed_action,
          v.approval_required, v.success_metric, v.risk, v.verification_method
         FROM experiments e
         JOIN experiment_versions v ON v.id = e.current_version_id
         WHERE e.id = ? AND e.organization_id = ? AND e.deleted_at IS NULL`,
      )
      .bind(experimentId, context.organization.id)
      .first<CurrentExperiment>();
    if (!current) throw new MissingExperimentError();
    if (current.record_version !== payload.expectedVersion) {
      throw new ConcurrencyError(current.record_version);
    }

    const sampleRepairOrder = await ensureSampleRepairOrder(context);
    const now = new Date().toISOString();
    const nextVersion = current.record_version + 1;
    const versionId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const resultId = crypto.randomUUID();
    const verificationId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const evidenceOneId = crypto.randomUUID();
    const evidenceTwoId = crypto.randomUUID();
    const resultPayload = buildDeterministicEvaluation(sampleRepairOrder);
    const resultHash = await sha256(JSON.stringify(resultPayload));

    try {
      const results = await context.db.batch([
        context.db
          .prepare(
            `UPDATE experiments
             SET status = 'Testing', current_version_id = ?,
                 record_version = record_version + 1,
                 sample_size = sample_size + 1, updated_at = ?
             WHERE id = ? AND organization_id = ? AND record_version = ? AND deleted_at IS NULL`,
          )
          .bind(
            versionId,
            now,
            experimentId,
            context.organization.id,
            payload.expectedVersion,
          ),
        context.db
          .prepare(
            `INSERT INTO experiment_versions
              (id, organization_id, experiment_id, version_number, schema_version,
               problem, primary_user, inputs_json, ai_task, proposed_action,
               approval_required, success_metric, risk, verification_method,
               change_note, created_by_user_id, created_at)
             VALUES (?, ?, ?, ?, '1.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            versionId,
            context.organization.id,
            experimentId,
            nextVersion,
            current.problem,
            current.primary_user,
            current.inputs_json,
            current.ai_task,
            current.proposed_action,
            current.approval_required,
            current.success_metric,
            current.risk,
            current.verification_method,
            "Ran against anonymized sample repair order SL-20481",
            context.user.id,
            now,
          ),
        context.db
          .prepare(
            `INSERT INTO workflow_runs
              (id, organization_id, experiment_version_id, repair_order_id,
               requested_by_user_id, status, correlation_id, model_name,
               started_at, completed_at, created_at)
             VALUES (?, ?, ?, ?, ?, 'completed', ?, 'deterministic-simulator-v1', ?, ?, ?)`,
          )
          .bind(
            runId,
            context.organization.id,
            versionId,
            sampleRepairOrder.id,
            context.user.id,
            correlationId,
            now,
            now,
            now,
          ),
        evidenceInsert(context, {
          id: evidenceOneId,
          runId,
          repairOrderId: sampleRepairOrder.id,
          claim: "Inspect the front brake condition before making a repair recommendation.",
          evidence: "Technician measured the front pads at 3 mm.",
          source: "Current MPI · line 8",
          confidence: "High",
          assumptions: "None accepted",
          needed: "Rotor thickness and runout measurements",
          status: "source_matched_action_held",
          now,
        }),
        evidenceInsert(context, {
          id: evidenceTwoId,
          runId,
          repairOrderId: sampleRepairOrder.id,
          claim: "The previously declined coolant service may still be relevant.",
          evidence: "Coolant service declined at 58,110 miles; current mileage is 62,447.",
          source: "RO 84721 · declined services",
          confidence: "Moderate",
          assumptions: "Assumes service was not completed elsewhere",
          needed: "Current condition and applicable OEM interval",
          status: "pending_schedule_review",
          now,
        }),
        context.db
          .prepare(
            `INSERT INTO workflow_results
              (id, organization_id, workflow_run_id, result_schema_version,
               result_payload_json, result_hash, worker_reference, immutable_at)
             VALUES (?, ?, ?, '1.0', ?, ?, 'deterministic-simulator-v1', ?)`,
          )
          .bind(
            resultId,
            context.organization.id,
            runId,
            JSON.stringify(resultPayload),
            resultHash,
            now,
          ),
        context.db
          .prepare(
            `INSERT INTO verification_results
              (id, organization_id, workflow_run_id, status, checks_json,
               expected_worker_reference, verified_result_hash, verified_by_user_id, created_at)
             VALUES (?, ?, ?, 'pending_human_review', ?, 'deterministic-simulator-v1', ?, ?, ?)`,
          )
          .bind(
            verificationId,
            context.organization.id,
            runId,
            JSON.stringify({
              sourceCoverage: "2_of_2",
              unsupportedClaims: 0,
              externalMutation: false,
            }),
            resultHash,
            context.user.id,
            now,
          ),
        context.db
          .prepare(
            `INSERT INTO audit_events
              (id, organization_id, actor_user_id, entity_type, entity_id,
               action, request_id, metadata_json, created_at)
             VALUES (?, ?, ?, 'workflow_run', ?, 'workflow_run.simulated', ?, ?, ?)`,
          )
          .bind(
            auditId,
            context.organization.id,
            context.user.id,
            runId,
            context.requestId,
            JSON.stringify({
              experimentId,
              experimentVersionId: versionId,
              repairOrderId: sampleRepairOrder.id,
              correlationId,
              resultHash,
            }),
            now,
          ),
      ]);
      if ((results[0].meta.changes ?? 0) !== 1) throw new ConcurrencyError();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE") || error instanceof ConcurrencyError) {
        const latest = await context.db.prepare("SELECT record_version FROM experiments WHERE id = ? AND organization_id = ? AND deleted_at IS NULL").bind(experimentId, context.organization.id).first<{ record_version: number }>();
        throw new ConcurrencyError(latest?.record_version);
      }
      throw error;
    }

    return Response.json({
      run: {
        id: runId,
        correlationId,
        status: "completed",
        mode: "simulated",
        resultHash,
        verificationStatus: "pending_human_review",
      },
      experiments: await listExperiments(context),
      requestId,
    }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof MissingExperimentError) {
      return errorJson(error.message, 404, requestId, "experiment_not_found");
    }
    if (error instanceof ConcurrencyError) {
      return errorJson(error.message, 409, requestId, "concurrency_conflict", { currentVersion: error.currentVersion });
    }
    return errorResponse(error, requestId);
  }
}

function evidenceInsert(
  context: Awaited<ReturnType<typeof requireAccess>>,
  input: {
    id: string;
    runId: string;
    repairOrderId: string;
    claim: string;
    evidence: string;
    source: string;
    confidence: string;
    assumptions: string;
    needed: string;
    status: string;
    now: string;
  },
) {
  return context.db
    .prepare(
      `INSERT INTO evidence_items
        (id, organization_id, workflow_run_id, repair_order_id, claim,
         supporting_evidence, source_reference, confidence,
         unsupported_assumptions, information_needed, verification_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      context.organization.id,
      input.runId,
      input.repairOrderId,
      input.claim,
      input.evidence,
      input.source,
      input.confidence,
      input.assumptions,
      input.needed,
      input.status,
      input.now,
    );
}
