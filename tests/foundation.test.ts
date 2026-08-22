import assert from "node:assert/strict";
import test from "node:test";
import {
  permissionsForRole,
  requiredPermissionForExperimentTransition,
  roleCan,
  validateExperimentWrite,
  ValidationError,
} from "../lib/foundation.ts";

test("role permissions fail closed at each authority boundary", () => {
  assert.equal(roleCan("viewer", "experiments:create"), false);
  assert.equal(roleCan("advisor", "experiments:validate"), false);
  assert.equal(roleCan("reviewer", "experiments:publish"), false);
  assert.equal(roleCan("manager", "approvals:decide"), true);
  assert.equal(roleCan("administrator", "organization:manage"), true);
  assert.deepEqual(permissionsForRole("viewer"), ["experiments:read"]);
});

test("protected experiment states require authoritative roles", () => {
  assert.equal(
    requiredPermissionForExperimentTransition("Draft", "Testing"),
    "experiments:update",
  );
  assert.equal(
    requiredPermissionForExperimentTransition("Testing", "Validated"),
    "experiments:validate",
  );
  assert.equal(
    requiredPermissionForExperimentTransition("Validated", "Draft"),
    "experiments:validate",
  );
  assert.equal(
    requiredPermissionForExperimentTransition("Published", "Draft"),
    "experiments:publish",
  );
});

test("experiment validation normalizes safe canonical fields", () => {
  const experiment = validateExperimentWrite({
    code: " exp-101 ",
    title: "Brake evidence review",
    problem: "Missing rotor measurement",
    user: "Service advisor",
    input: "Anonymized repair order",
    task: "Identify missing evidence",
    action: "Draft a review note",
    approval: "Advisor approval",
    metric: "Documentation completeness",
    risk: "Unsupported claim",
    verification: "Match every claim to evidence",
  });
  assert.equal(experiment.code, "EXP-101");
  assert.equal(experiment.status, "Draft");
  assert.equal(experiment.sampleSize, 0);
});

test("experiment validation rejects invalid state", () => {
  assert.throws(
    () =>
      validateExperimentWrite({
        code: "EXP-102",
        title: "Invalid state",
        problem: "Problem",
        user: "Advisor",
        input: "Input",
        task: "Task",
        action: "Action",
        approval: "Approval",
        metric: "Metric",
        risk: "Risk",
        verification: "Verification",
        status: "Executed",
      }),
    ValidationError,
  );
});
