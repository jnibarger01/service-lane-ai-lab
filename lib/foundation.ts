export const roles = [
  "viewer",
  "advisor",
  "reviewer",
  "manager",
  "administrator",
] as const;

export type Role = (typeof roles)[number];
export type Permission =
  | "experiments:read"
  | "experiments:create"
  | "experiments:update"
  | "experiments:validate"
  | "experiments:publish"
  | "approvals:decide"
  | "organization:manage";

const rolePermissions: Record<Role, readonly Permission[]> = {
  viewer: ["experiments:read"],
  advisor: ["experiments:read", "experiments:create", "experiments:update"],
  reviewer: [
    "experiments:read",
    "experiments:create",
    "experiments:update",
    "experiments:validate",
  ],
  manager: [
    "experiments:read",
    "experiments:create",
    "experiments:update",
    "experiments:validate",
    "experiments:publish",
    "approvals:decide",
  ],
  administrator: [
    "experiments:read",
    "experiments:create",
    "experiments:update",
    "experiments:validate",
    "experiments:publish",
    "approvals:decide",
    "organization:manage",
  ],
};

export function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return rolePermissions[role];
}

export function roleCan(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function requiredPermissionForExperimentTransition(
  currentStatus: string,
  requestedStatus: string,
): Permission {
  if (currentStatus === "Published" || requestedStatus === "Published") {
    return "experiments:publish";
  }
  if (
    currentStatus === "Validated" ||
    currentStatus === "Rejected" ||
    requestedStatus === "Validated" ||
    requestedStatus === "Rejected"
  ) {
    return "experiments:validate";
  }
  return "experiments:update";
}

export type ExperimentWrite = {
  code: string;
  title: string;
  problem: string;
  user: string;
  input: string;
  task: string;
  action: string;
  approval: string;
  metric: string;
  risk: string;
  verification: string;
  status?: string;
  sampleSize?: number;
  confidence?: string;
  changeNote?: string;
};

const statuses = [
  "Draft",
  "Testing",
  "Validated",
  "Rejected",
  "Published",
  "Archived",
] as const;

function cleanText(value: unknown, field: string, max = 2000): string {
  if (typeof value !== "string") throw new ValidationError(`${field} must be text`);
  const cleaned = value.trim();
  if (!cleaned) throw new ValidationError(`${field} is required`);
  if (cleaned.length > max) {
    throw new ValidationError(`${field} must be ${max} characters or fewer`);
  }
  return cleaned;
}

export class ValidationError extends Error {}

export function validateExperimentWrite(value: unknown): ExperimentWrite {
  if (!value || typeof value !== "object") {
    throw new ValidationError("experiment payload must be an object");
  }
  const input = value as Record<string, unknown>;
  const status = input.status === undefined ? "Draft" : cleanText(input.status, "status", 32);
  if (!statuses.includes(status as (typeof statuses)[number])) {
    throw new ValidationError("status is invalid");
  }
  const sampleSize =
    input.sampleSize === undefined ? 0 : Number.parseInt(String(input.sampleSize), 10);
  if (!Number.isInteger(sampleSize) || sampleSize < 0 || sampleSize > 1_000_000) {
    throw new ValidationError("sampleSize must be a non-negative integer");
  }

  return {
    code: cleanText(input.code, "code", 40).toUpperCase(),
    title: cleanText(input.title, "title", 240),
    problem: cleanText(input.problem, "problem"),
    user: cleanText(input.user, "user", 120),
    input: cleanText(input.input, "input"),
    task: cleanText(input.task, "task"),
    action: cleanText(input.action, "action"),
    approval: cleanText(input.approval, "approval"),
    metric: cleanText(input.metric, "metric"),
    risk: cleanText(input.risk, "risk"),
    verification: cleanText(input.verification, "verification"),
    status,
    sampleSize,
    confidence: cleanText(input.confidence ?? "Low", "confidence", 32),
    changeNote: cleanText(input.changeNote ?? "Experiment definition updated", "changeNote", 300),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
