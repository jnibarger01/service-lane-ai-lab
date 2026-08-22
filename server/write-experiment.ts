import { validateExperimentWrite, type ExperimentWrite } from "@/lib/foundation";
import type { AccessContext } from "@/server/access";

export async function createExperimentRecord(
  context: AccessContext,
  payload: unknown,
  options: { importMode?: boolean } = {},
) {
  const input = validateExperimentWrite(payload);
  const existing = await context.db
    .prepare(
      "SELECT id FROM experiments WHERE organization_id = ? AND code = ? AND deleted_at IS NULL",
    )
    .bind(context.organization.id, input.code)
    .first<{ id: string }>();
  if (existing) {
    if (options.importMode) return { id: existing.id, imported: false };
    throw new DuplicateExperimentError(input.code);
  }

  const experimentId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const legacyVersions = options.importMode
    ? readLegacyVersions(payload)
    : [{ version: 1, note: input.changeNote ?? "Initial experiment definition", date: now }];
  const versionRecords = legacyVersions.map((version) => ({
    ...version,
    id: crypto.randomUUID(),
  }));
  const currentVersion = versionRecords[versionRecords.length - 1];

  await context.db.batch([
    context.db
      .prepare(
        `INSERT INTO experiments
          (id, organization_id, code, title, status, current_version_id,
           record_version, sample_size, confidence, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        experimentId,
        context.organization.id,
        input.code,
        input.title,
        input.status,
        currentVersion.id,
        currentVersion.version,
        input.sampleSize,
        input.confidence,
        context.user.id,
        now,
        now,
      ),
    ...versionRecords.map((version) =>
      versionInsert(context, {
        experimentId,
        versionId: version.id,
        versionNumber: version.version,
        input,
        changeNote: version.note,
        now: version.date,
      }),
    ),
    context.db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, actor_user_id, entity_type, entity_id, action, request_id, metadata_json, created_at)
         VALUES (?, ?, ?, 'experiment', ?, ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        context.organization.id,
        context.user.id,
        experimentId,
        options.importMode ? "experiment.imported" : "experiment.created",
        context.requestId,
        JSON.stringify({
          code: input.code,
          recordVersion: currentVersion.version,
          importedVersions: versionRecords.length,
        }),
        now,
      ),
  ]);

  return { id: experimentId, imported: true };
}

function readLegacyVersions(payload: unknown) {
  const candidate =
    payload && typeof payload === "object"
      ? (payload as { versions?: unknown }).versions
      : undefined;
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return [
      {
        version: 1,
        note: "Imported from browser-local prototype",
        date: new Date().toISOString(),
      },
    ];
  }
  const sanitized = candidate
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as {
        version?: unknown;
        note?: unknown;
        date?: unknown;
      };
      const version = Number.parseInt(String(item.version), 10);
      if (!Number.isInteger(version) || version < 1) return null;
      const note =
        typeof item.note === "string" && item.note.trim()
          ? item.note.trim().slice(0, 300)
          : "Imported prototype version";
      const parsedDate =
        typeof item.date === "string" ? new Date(item.date) : new Date();
      return {
        version,
        note,
        date: Number.isNaN(parsedDate.valueOf())
          ? new Date().toISOString()
          : parsedDate.toISOString(),
      };
    })
    .filter((entry): entry is { version: number; note: string; date: string } =>
      Boolean(entry),
    )
    .sort((a, b) => a.version - b.version);
  return sanitized.length
    ? sanitized
    : [
        {
          version: 1,
          note: "Imported from browser-local prototype",
          date: new Date().toISOString(),
        },
      ];
}

export async function updateExperimentRecord(
  context: AccessContext,
  experimentId: string,
  payload: unknown,
  expectedVersion: number,
) {
  const input = validateExperimentWrite(payload);
  const current = await context.db
    .prepare(
      `SELECT record_version
       FROM experiments
       WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
    )
    .bind(experimentId, context.organization.id)
    .first<{ record_version: number }>();
  if (!current) throw new MissingExperimentError();
  if (current.record_version !== expectedVersion) {
    throw new ConcurrencyError(current.record_version);
  }

  const nextVersion = expectedVersion + 1;
  const versionId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const archivedAt = input.status === "Archived" ? now : null;

  try {
    const results = await context.db.batch([
      context.db
        .prepare(
          `UPDATE experiments
           SET code = ?, title = ?, status = ?, current_version_id = ?,
               record_version = record_version + 1, sample_size = ?, confidence = ?,
               archived_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND record_version = ? AND deleted_at IS NULL`,
        )
        .bind(
          input.code,
          input.title,
          input.status,
          versionId,
          input.sampleSize,
          input.confidence,
          archivedAt,
          now,
          experimentId,
          context.organization.id,
          expectedVersion,
        ),
      versionInsert(context, {
        experimentId,
        versionId,
        versionNumber: nextVersion,
        input,
        changeNote: input.changeNote ?? "Experiment definition updated",
        now,
      }),
      context.db
        .prepare(
          `INSERT INTO audit_events
            (id, organization_id, actor_user_id, entity_type, entity_id, action, request_id, metadata_json, created_at)
           VALUES (?, ?, ?, 'experiment', ?, 'experiment.updated', ?, ?, ?)`,
        )
        .bind(
          auditId,
          context.organization.id,
          context.user.id,
          experimentId,
          context.requestId,
          JSON.stringify({ expectedVersion, recordVersion: nextVersion, status: input.status }),
          now,
        ),
    ]);
    if ((results[0].meta.changes ?? 0) !== 1) throw new ConcurrencyError();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE") || error instanceof ConcurrencyError) {
      throw new ConcurrencyError();
    }
    throw error;
  }
}

function versionInsert(
  context: AccessContext,
  values: {
    experimentId: string;
    versionId: string;
    versionNumber: number;
    input: ExperimentWrite;
    changeNote: string;
    now: string;
  },
) {
  return context.db
    .prepare(
      `INSERT INTO experiment_versions
        (id, organization_id, experiment_id, version_number, schema_version,
         problem, primary_user, inputs_json, ai_task, proposed_action,
         approval_required, success_metric, risk, verification_method,
         change_note, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, '1.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      values.versionId,
      context.organization.id,
      values.experimentId,
      values.versionNumber,
      values.input.problem,
      values.input.user,
      JSON.stringify([values.input.input]),
      values.input.task,
      values.input.action,
      values.input.approval,
      values.input.metric,
      values.input.risk,
      values.input.verification,
      values.changeNote,
      context.user.id,
      values.now,
    );
}

export class DuplicateExperimentError extends Error {
  constructor(code: string) {
    super(`Experiment code ${code} already exists`);
  }
}

export class MissingExperimentError extends Error {
  constructor() {
    super("Experiment not found");
  }
}

export class ConcurrencyError extends Error {
  constructor(public readonly currentVersion?: number) {
    super("Experiment changed since it was loaded");
  }
}
