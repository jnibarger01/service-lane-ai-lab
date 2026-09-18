import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparisonReport,
  buildEvidenceTimeline,
  type ComparisonInput,
  type TimelineInput,
} from "../server/reports.ts";

test("comparison report returns metric deltas and evidence summaries", () => {
  const input: ComparisonInput = {
    left: { id: "run-a", experimentId: "exp-a", code: "EXP-001", title: "Baseline", sampleSize: 10, confidence: "Low", status: "completed", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:05:00Z", metrics: { reviewMinutes: 18, approvedClaims: 2 }, evidence: { total: 1, verified: 1, pending: 0 } },
    right: { id: "run-b", experimentId: "exp-b", code: "EXP-002", title: "Assisted", sampleSize: 12, confidence: "Moderate", status: "completed", startedAt: "2026-01-02T00:00:00Z", completedAt: "2026-01-02T00:04:00Z", metrics: { reviewMinutes: 11, approvedClaims: 3 }, evidence: { total: 2, verified: 1, pending: 1 } },
  };
  const report = buildComparisonReport(input);
  assert.deepEqual(report.metricDeltas, [
    { metric: "approvedClaims", left: 2, right: 3, delta: 1, direction: "improved" },
    { metric: "reviewMinutes", left: 18, right: 11, delta: -7, direction: "improved" },
  ]);
  assert.equal(report.evidenceSummary.left.total, 1);
  assert.equal(report.evidenceSummary.right.pending, 1);
});

test("timeline orders run and evidence events for replay", () => {
  const input: TimelineInput = {
    run: { id: "run-1", status: "completed", correlationId: "corr-1", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:03:00Z", modelName: "simulator" },
    evidence: [
      { id: "ev-2", claim: "second", source: "line 2", confidence: "Moderate", verificationStatus: "pending", createdAt: "2026-01-01T00:02:00Z" },
      { id: "ev-1", claim: "first", source: "line 1", confidence: "High", verificationStatus: "verified", createdAt: "2026-01-01T00:01:00Z" },
    ],
    result: { resultHash: "hash-1", workerReference: "simulator", payload: { metric: 11 } },
  };
  const replay = buildEvidenceTimeline(input);
  assert.deepEqual(replay.events.map((event) => event.type), ["run.started", "evidence.created", "evidence.created", "run.completed"]);
  assert.equal("evidenceId" in replay.events[1] && replay.events[1].evidenceId, "ev-1");
  assert.ok(replay.result);
  assert.equal(replay.result.resultHash, "hash-1");
});
