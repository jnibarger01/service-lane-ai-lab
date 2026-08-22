import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
    deletedAt: text("deleted_at"),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("organizations_slug_uq").on(table.slug)],
);

export const organizationMemberships = sqliteTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    ...timestamps,
    revokedAt: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("Draft"),
    currentVersionId: text("current_version_id"),
    recordVersion: integer("record_version").notNull().default(1),
    sampleSize: integer("sample_size").notNull().default(0),
    confidence: text("confidence").notNull().default("Low"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("experiments_org_code_uq").on(table.organizationId, table.code),
    index("experiments_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const experimentVersions = sqliteTable(
  "experiment_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    schemaVersion: text("schema_version").notNull().default("1.0"),
    problem: text("problem").notNull(),
    primaryUser: text("primary_user").notNull(),
    inputsJson: text("inputs_json").notNull(),
    aiTask: text("ai_task").notNull(),
    proposedAction: text("proposed_action").notNull(),
    approvalRequired: text("approval_required").notNull(),
    successMetric: text("success_metric").notNull(),
    risk: text("risk").notNull(),
    verificationMethod: text("verification_method").notNull(),
    changeNote: text("change_note").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("experiment_versions_number_uq").on(
      table.experimentId,
      table.versionNumber,
    ),
    index("experiment_versions_org_idx").on(table.organizationId),
  ],
);

export const repairOrders = sqliteTable(
  "repair_orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceReference: text("source_reference").notNull(),
    sourceHash: text("source_hash").notNull(),
    lineageJson: text("lineage_json").notNull(),
    vinMasked: text("vin_masked").notNull(),
    customerReferenceMasked: text("customer_reference_masked").notNull(),
    vehicleYear: integer("vehicle_year"),
    vehicleModel: text("vehicle_model"),
    mileage: integer("mileage"),
    normalizedPayloadJson: text("normalized_payload_json").notNull(),
    status: text("status").notNull().default("validated"),
    recordVersion: integer("record_version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("repair_orders_org_source_hash_uq").on(
      table.organizationId,
      table.sourceHash,
    ),
    index("repair_orders_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    experimentVersionId: text("experiment_version_id")
      .notNull()
      .references(() => experimentVersions.id, { onDelete: "restrict" }),
    repairOrderId: text("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "restrict" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    correlationId: text("correlation_id").notNull(),
    modelName: text("model_name"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
    failureCode: text("failure_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("workflow_runs_correlation_uq").on(
      table.organizationId,
      table.correlationId,
    ),
    index("workflow_runs_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const evidenceItems = sqliteTable(
  "evidence_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    repairOrderId: text("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "restrict" }),
    claim: text("claim").notNull(),
    supportingEvidence: text("supporting_evidence").notNull(),
    sourceReference: text("source_reference").notNull(),
    confidence: text("confidence").notNull(),
    unsupportedAssumptions: text("unsupported_assumptions").notNull(),
    informationNeeded: text("information_needed").notNull(),
    verificationStatus: text("verification_status").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("evidence_items_run_idx").on(table.workflowRunId),
    index("evidence_items_org_idx").on(table.organizationId),
  ],
);

export const workflowResults = sqliteTable(
  "workflow_results",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    resultSchemaVersion: text("result_schema_version").notNull().default("1.0"),
    resultPayloadJson: text("result_payload_json").notNull(),
    resultHash: text("result_hash").notNull(),
    workerReference: text("worker_reference").notNull(),
    immutableAt: text("immutable_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("workflow_results_run_uq").on(table.workflowRunId),
    index("workflow_results_hash_idx").on(table.organizationId, table.resultHash),
  ],
);

export const approvalRequests = sqliteTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    actionSchemaVersion: text("action_schema_version").notNull(),
    actionType: text("action_type").notNull(),
    actionPayloadJson: text("action_payload_json").notNull(),
    actionHash: text("action_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    riskClassification: text("risk_classification").notNull(),
    requestedPermission: text("requested_permission").notNull(),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approverUserId: text("approver_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    rejectionReason: text("rejection_reason"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    ...timestamps,
  },
  (table) => [
    index("approval_requests_action_hash_idx").on(
      table.organizationId,
      table.actionHash,
    ),
    uniqueIndex("approval_requests_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("approval_requests_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const verificationResults = sqliteTable(
  "verification_results",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    approvalRequestId: text("approval_request_id").references(
      () => approvalRequests.id,
      { onDelete: "restrict" },
    ),
    status: text("status").notNull(),
    checksJson: text("checks_json").notNull(),
    expectedWorkerReference: text("expected_worker_reference"),
    verifiedResultHash: text("verified_result_hash"),
    verifiedByUserId: text("verified_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("verification_results_run_idx").on(table.workflowRunId),
    index("verification_results_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    requestId: text("request_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_events_entity_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
    index("audit_events_request_idx").on(table.organizationId, table.requestId),
  ],
);
