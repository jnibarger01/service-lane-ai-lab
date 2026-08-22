CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`action_schema_version` text NOT NULL,
	`action_type` text NOT NULL,
	`action_payload_json` text NOT NULL,
	`action_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`risk_classification` text NOT NULL,
	`requested_permission` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`approver_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_reason` text,
	`rejection_reason` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `approval_requests_action_hash_idx` ON `approval_requests` (`organization_id`,`action_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `approval_requests_idempotency_uq` ON `approval_requests` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `approval_requests_org_status_idx` ON `approval_requests` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`request_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`organization_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_request_idx` ON `audit_events` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`repair_order_id` text NOT NULL,
	`claim` text NOT NULL,
	`supporting_evidence` text NOT NULL,
	`source_reference` text NOT NULL,
	`confidence` text NOT NULL,
	`unsupported_assumptions` text NOT NULL,
	`information_needed` text NOT NULL,
	`verification_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`repair_order_id`) REFERENCES `repair_orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `evidence_items_run_idx` ON `evidence_items` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `evidence_items_org_idx` ON `evidence_items` (`organization_id`);--> statement-breakpoint
CREATE TABLE `experiment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`schema_version` text DEFAULT '1.0' NOT NULL,
	`problem` text NOT NULL,
	`primary_user` text NOT NULL,
	`inputs_json` text NOT NULL,
	`ai_task` text NOT NULL,
	`proposed_action` text NOT NULL,
	`approval_required` text NOT NULL,
	`success_metric` text NOT NULL,
	`risk` text NOT NULL,
	`verification_method` text NOT NULL,
	`change_note` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_versions_number_uq` ON `experiment_versions` (`experiment_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `experiment_versions_org_idx` ON `experiment_versions` (`organization_id`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`current_version_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'Low' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_org_code_uq` ON `experiments` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `experiments_org_status_idx` ON `experiments` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `organization_memberships` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `organization_memberships_user_idx` ON `organization_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `repair_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`source_reference` text NOT NULL,
	`source_hash` text NOT NULL,
	`lineage_json` text NOT NULL,
	`vin_masked` text NOT NULL,
	`customer_reference_masked` text NOT NULL,
	`vehicle_year` integer,
	`vehicle_model` text,
	`mileage` integer,
	`normalized_payload_json` text NOT NULL,
	`status` text DEFAULT 'validated' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repair_orders_org_source_hash_uq` ON `repair_orders` (`organization_id`,`source_hash`);--> statement-breakpoint
CREATE INDEX `repair_orders_org_status_idx` ON `repair_orders` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_results` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`approval_request_id` text,
	`status` text NOT NULL,
	`checks_json` text NOT NULL,
	`expected_worker_reference` text,
	`verified_result_hash` text,
	`verified_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approval_request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `verification_results_run_idx` ON `verification_results` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `verification_results_org_status_idx` ON `verification_results` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `workflow_results` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`result_schema_version` text DEFAULT '1.0' NOT NULL,
	`result_payload_json` text NOT NULL,
	`result_hash` text NOT NULL,
	`worker_reference` text NOT NULL,
	`immutable_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_results_run_uq` ON `workflow_results` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `workflow_results_hash_idx` ON `workflow_results` (`organization_id`,`result_hash`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`experiment_version_id` text NOT NULL,
	`repair_order_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`model_name` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`failure_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`experiment_version_id`) REFERENCES `experiment_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`repair_order_id`) REFERENCES `repair_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_correlation_uq` ON `workflow_runs` (`organization_id`,`correlation_id`);--> statement-breakpoint
CREATE INDEX `workflow_runs_org_status_idx` ON `workflow_runs` (`organization_id`,`status`);