import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("foundation migration creates tenant-scoped canonical tables", async () => {
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assert.deepEqual(migrationFiles.length, 1, "expected one foundation migration");
  const migration = await readFile(
    new URL(migrationFiles[0], migrationDirectory),
    "utf8",
  );
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));

  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all();
  const names = rows.map((row) => row.name);
  for (const table of [
    "users",
    "organizations",
    "organization_memberships",
    "experiments",
    "experiment_versions",
    "repair_orders",
    "workflow_runs",
    "evidence_items",
    "workflow_results",
    "approval_requests",
    "verification_results",
    "audit_events",
  ]) {
    assert.ok(names.includes(table), `missing ${table}`);
  }

  db.exec(`
    INSERT INTO users (id, email, display_name) VALUES ('u1', 'one@example.com', 'One');
    INSERT INTO organizations (id, name, slug) VALUES
      ('o1', 'One', 'one'),
      ('o2', 'Two', 'two');
    INSERT INTO experiments
      (id, organization_id, code, title, status, created_by_user_id)
    VALUES
      ('e1', 'o1', 'EXP-001', 'One experiment', 'Draft', 'u1'),
      ('e2', 'o2', 'EXP-001', 'Two experiment', 'Draft', 'u1');
  `);
  const scoped = db
    .prepare("SELECT id FROM experiments WHERE organization_id = ?")
    .all("o1");
  assert.deepEqual(scoped.map((row) => row.id), ["e1"]);

  const resultHashIndex = db
    .prepare(
      "SELECT `unique` FROM pragma_index_list('workflow_results') WHERE name = ?",
    )
    .get("workflow_results_hash_idx");
  const approvalHashIndex = db
    .prepare(
      "SELECT `unique` FROM pragma_index_list('approval_requests') WHERE name = ?",
    )
    .get("approval_requests_action_hash_idx");
  assert.equal(resultHashIndex.unique, 0, "result hashes must be reusable across runs");
  assert.equal(
    approvalHashIndex.unique,
    0,
    "action hashes must be reusable with distinct idempotency keys",
  );
  db.close();
});
