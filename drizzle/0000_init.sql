CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'renter' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `adviser_note` (
	`id` text PRIMARY KEY NOT NULL,
	`referral_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`visible_to_renter` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`referral_id`) REFERENCES `case_referral`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`org_id` text,
	`outcome` text DEFAULT 'success' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_event` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_resource_idx` ON `audit_event` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_event` (`created_at`);--> statement-breakpoint
CREATE TABLE `case_referral` (
	`id` text PRIMARY KEY NOT NULL,
	`consent_grant_id` text NOT NULL,
	`org_id` text NOT NULL,
	`review_status` text DEFAULT 'new' NOT NULL,
	`assigned_adviser_id` text,
	`closed_at` integer,
	`closure_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`consent_grant_id`) REFERENCES `consent_grant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_adviser_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_referral_consent_grant_id_unique` ON `case_referral` (`consent_grant_id`);--> statement-breakpoint
CREATE INDEX `referral_org_idx` ON `case_referral` (`org_id`);--> statement-breakpoint
CREATE TABLE `consent_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`scope` text DEFAULT 'redacted' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consent_user_idx` ON `consent_grant` (`user_id`);--> statement-breakpoint
CREATE INDEX `consent_org_idx` ON `consent_grant` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `feature_flag` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`description` text NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `job_run` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `monitoring_job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_run_job_idx` ON `job_run` (`job_id`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`investigation_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`purpose` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`succeeded` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `llm_usage_user_idx` ON `llm_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `monitoring_job` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`job_type` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`interval_hours` integer DEFAULT 24 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`last_status` text,
	`last_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_due_idx` ON `monitoring_job` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `job_owner_idx` ON `monitoring_job` (`owner_id`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`dedupe_key` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe_key_unique` ON `notification` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`in_app` integer DEFAULT true NOT NULL,
	`email` integer DEFAULT false NOT NULL,
	`deadline_reminders` integer DEFAULT true NOT NULL,
	`listing_updates` integer DEFAULT true NOT NULL,
	`case_updates` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`org_type` text NOT NULL,
	`brand_color` text DEFAULT '#14B8A6' NOT NULL,
	`display_name` text,
	`contact_email` text,
	`min_aggregate_group_size` integer DEFAULT 5 NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_invitation_token_hash_unique` ON `organization_invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `organization_invitation` (`org_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `organization_invitation` (`email`);--> statement-breakpoint
CREATE TABLE `organization_membership` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_org_user_uq` ON `organization_membership` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `organization_membership` (`user_id`);--> statement-breakpoint
CREATE TABLE `provider_health_check` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`latency_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_check_idx` ON `provider_health_check` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`city` text,
	`province` text,
	`renter_type` text,
	`budget_min_cents` integer,
	`budget_max_cents` integer,
	`bedrooms` integer,
	`desired_location` text,
	`move_in_date` text,
	`accessibility_needs` text,
	`onboarding_completed_at` integer,
	`retention_days` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`doc_type` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`investigation_id` text,
	`tenancy_id` text,
	`maintenance_case_id` text,
	`dispute_id` text,
	`deposit_id` text,
	`current_version` integer DEFAULT 1 NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_owner_idx` ON `document` (`owner_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `document_investigation_idx` ON `document` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `document_version` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`storage_provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`page_count` integer,
	`extracted_text` text,
	`page_texts` text,
	`extraction_method` text DEFAULT 'none' NOT NULL,
	`extraction_status` text DEFAULT 'not_attempted' NOT NULL,
	`extraction_note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_version_uq` ON `document_version` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `document_version_sha_idx` ON `document_version` (`sha256`);--> statement-breakpoint
CREATE TABLE `image_fingerprint` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`document_version_id` text,
	`listing_image_id` text,
	`p_hash` text NOT NULL,
	`a_hash` text NOT NULL,
	`width` integer,
	`height` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `document_version`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fingerprint_owner_idx` ON `image_fingerprint` (`owner_id`);--> statement-breakpoint
CREATE INDEX `fingerprint_listing_img_idx` ON `image_fingerprint` (`listing_image_id`);--> statement-breakpoint
CREATE TABLE `agent_run` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`planner_mode` text NOT NULL,
	`planner_note` text,
	`max_iterations` integer NOT NULL,
	`max_tool_calls` integer NOT NULL,
	`iterations` integer DEFAULT 0 NOT NULL,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`state_version_at_start` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`summary` text,
	`open_questions` text,
	`error` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_idempotency_key_unique` ON `agent_run` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_run_investigation_idx` ON `agent_run` (`investigation_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `claim` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`claim_type` text NOT NULL,
	`value` text NOT NULL,
	`normalized` text NOT NULL,
	`excerpt` text,
	`locator` text,
	`extractor` text NOT NULL,
	`extraction_confidence` text,
	`status` text DEFAULT 'unverified' NOT NULL,
	`corrects_claim_id` text,
	`superseded_at` integer,
	`extracted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_checked_at` integer,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_investigation_idx` ON `claim` (`investigation_id`,`claim_type`);--> statement-breakpoint
CREATE INDEX `claim_evidence_idx` ON `claim` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `claim_link` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`from_claim_id` text NOT NULL,
	`to_claim_id` text NOT NULL,
	`relation` text NOT NULL,
	`explanation` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_link_uq` ON `claim_link` (`from_claim_id`,`to_claim_id`,`relation`);--> statement-breakpoint
CREATE INDEX `claim_link_investigation_idx` ON `claim_link` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `communication` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`investigation_id` text,
	`maintenance_case_id` text,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`counterpart_name` text,
	`counterpart_contact` text,
	`body` text NOT NULL,
	`occurred_at` integer,
	`evidence_id` text,
	`message_draft_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `communication_investigation_idx` ON `communication` (`investigation_id`);--> statement-breakpoint
CREATE INDEX `communication_owner_idx` ON `communication` (`owner_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`text_content` text,
	`document_id` text,
	`document_version_id` text,
	`source_url` text,
	`provenance` text NOT NULL,
	`occurred_at` integer,
	`supersedes_evidence_id` text,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`processing_note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `document_version`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `evidence_investigation_idx` ON `evidence` (`investigation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `finding` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`finding_key` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`severity` text NOT NULL,
	`lifecycle` text DEFAULT 'active' NOT NULL,
	`title` text NOT NULL,
	`explanation` text NOT NULL,
	`recommendation` text,
	`rule_key` text,
	`rule_version` integer,
	`citation_label` text,
	`citation_url` text,
	`claim_ids` text DEFAULT '[]' NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`requires_human_review` integer DEFAULT false NOT NULL,
	`human_review` text DEFAULT 'not_required' NOT NULL,
	`human_review_note` text,
	`detected_by_run_id` text,
	`first_detected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_evaluated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	`resolution_note` text,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finding_key_uq` ON `finding` (`investigation_id`,`finding_key`);--> statement-breakpoint
CREATE INDEX `finding_investigation_idx` ON `finding` (`investigation_id`,`lifecycle`);--> statement-breakpoint
CREATE TABLE `investigation` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`city` text,
	`province` text DEFAULT 'NS' NOT NULL,
	`jurisdiction` text DEFAULT 'CA-NS' NOT NULL,
	`listing_id` text,
	`summary` text,
	`state_version` integer DEFAULT 0 NOT NULL,
	`last_run_at` integer,
	`is_demo` integer DEFAULT false NOT NULL,
	`demo_scenario` text,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `investigation_owner_idx` ON `investigation` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `investigation_action` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`action_key` text NOT NULL,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`message_draft_id` text,
	`proposed_by_run_id` text,
	`verification_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_key_uq` ON `investigation_action` (`investigation_id`,`action_key`);--> statement-breakpoint
CREATE TABLE `investigation_event` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_investigation_idx` ON `investigation_event` (`investigation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `message_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`investigation_id` text,
	`maintenance_case_id` text,
	`purpose` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`recipient` text,
	`generated_by` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`provider_id` text,
	`provider_message_id` text,
	`provider_error` text,
	`approved_at` integer,
	`submitted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `draft_owner_idx` ON `message_draft` (`owner_id`);--> statement-breakpoint
CREATE INDEX `draft_investigation_idx` ON `message_draft` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `prepayment_review` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`requested_amount_cents` integer,
	`purpose` text,
	`payment_method` text,
	`recipient_name` text,
	`due_by` text,
	`lease_signed` integer,
	`viewed_in_person` integer,
	`checklist` text DEFAULT '{}' NOT NULL,
	`result` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prepayment_investigation_uq` ON `prepayment_review` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `tool_run` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`investigation_id` text NOT NULL,
	`iteration` integer NOT NULL,
	`tool` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`reason` text,
	`input_hash` text,
	`input_summary` text,
	`output` text,
	`error` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tool_run_run_idx` ON `tool_run` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `tool_run_investigation_idx` ON `tool_run` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `verification_check` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`check_type` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`method` text,
	`summary` text,
	`performed_by` text,
	`provider_id` text,
	`provider_mode` text,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`details` text,
	`checked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_check_uq` ON `verification_check` (`investigation_id`,`check_type`);--> statement-breakpoint
CREATE TABLE `verification_history` (
	`id` text PRIMARY KEY NOT NULL,
	`check_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`check_id`) REFERENCES `verification_check`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verification_history_check_idx` ON `verification_history` (`check_id`);--> statement-breakpoint
CREATE TABLE `legal_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_key` text NOT NULL,
	`jurisdiction` text NOT NULL,
	`category` text NOT NULL,
	`logic_key` text NOT NULL,
	`effective_version` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_rule_rule_key_unique` ON `legal_rule` (`rule_key`);--> statement-breakpoint
CREATE TABLE `legal_rule_version` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`conditions` text NOT NULL,
	`citation` text NOT NULL,
	`source_key` text NOT NULL,
	`source_excerpt` text,
	`effective_from` text,
	`effective_to` text,
	`params` text,
	`review_status` text NOT NULL,
	`verified_on` text,
	`change_note` text,
	`created_by` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `legal_rule`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_version_uq` ON `legal_rule_version` (`rule_id`,`version`);--> statement-breakpoint
CREATE INDEX `rule_version_status_idx` ON `legal_rule_version` (`review_status`);--> statement-breakpoint
CREATE TABLE `legal_source` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`source_type` text NOT NULL,
	`verified_on` text,
	`verification_note` text,
	`status` text NOT NULL,
	`last_checked_at` integer,
	`last_check_http_status` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_source_source_key_unique` ON `legal_source` (`source_key`);--> statement-breakpoint
CREATE TABLE `listing_image` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`url` text,
	`document_version_id` text,
	`caption` text,
	`provenance` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `rental_listing`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listing_image_listing_idx` ON `listing_image` (`listing_id`);--> statement-breakpoint
CREATE TABLE `listing_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`captured_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `rental_listing`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshot_listing_idx` ON `listing_snapshot` (`listing_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `listing_source` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`attribution` text NOT NULL,
	`terms_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listing_source_source_key_unique` ON `listing_source` (`source_key`);--> statement-breakpoint
CREATE TABLE `property_comparison` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`listing_ids` text NOT NULL,
	`origin_investigation_id` text,
	`weights` text NOT NULL,
	`anchor` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comparison_user_idx` ON `property_comparison` (`user_id`);--> statement-breakpoint
CREATE TABLE `rental_listing` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`external_id` text,
	`owner_id` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`address` text,
	`neighbourhood` text,
	`city` text NOT NULL,
	`province` text DEFAULT 'NS' NOT NULL,
	`postal_code` text,
	`lat` real,
	`lng` real,
	`coordinates_source` text DEFAULT 'none' NOT NULL,
	`rent_cents` integer,
	`deposit_cents` integer,
	`upfront_fees_cents` integer,
	`bedrooms` integer,
	`bathrooms` real,
	`property_type` text,
	`furnished` integer,
	`parking` text,
	`pets_allowed` integer,
	`utilities_included` text DEFAULT '[]' NOT NULL,
	`accessibility_features` text DEFAULT '[]' NOT NULL,
	`features` text DEFAULT '[]' NOT NULL,
	`lease_type` text,
	`available_from` text,
	`published_at` integer,
	`retrieved_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`source_url` text,
	`availability_status` text DEFAULT 'unverified' NOT NULL,
	`data_confidence` text NOT NULL,
	`contact_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listing_source_external_uq` ON `rental_listing` (`source_key`,`external_id`);--> statement-breakpoint
CREATE INDEX `listing_city_idx` ON `rental_listing` (`city`,`rent_cents`);--> statement-breakpoint
CREATE INDEX `listing_owner_idx` ON `rental_listing` (`owner_id`);--> statement-breakpoint
CREATE TABLE `saved_property` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`notes` text,
	`watch` integer DEFAULT false NOT NULL,
	`in_comparison` integer DEFAULT false NOT NULL,
	`investigation_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `rental_listing`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_property_uq` ON `saved_property` (`user_id`,`listing_id`);--> statement-breakpoint
CREATE TABLE `saved_search` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	`alerts_enabled` integer DEFAULT false NOT NULL,
	`last_run_at` integer,
	`last_result_count` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_search_user_idx` ON `saved_search` (`user_id`);--> statement-breakpoint
CREATE TABLE `search_run` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`saved_search_id` text,
	`origin_investigation_id` text,
	`filters` text NOT NULL,
	`provider_results` text NOT NULL,
	`result_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_run_user_idx` ON `search_run` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `deposit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`deposit_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_on` text NOT NULL,
	`amount_cents` integer,
	`description` text NOT NULL,
	`document_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deposit_id`) REFERENCES `deposit_record`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deposit_event_deposit_idx` ON `deposit_event` (`deposit_id`);--> statement-breakpoint
CREATE TABLE `deposit_record` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`tenancy_id` text,
	`amount_cents` integer NOT NULL,
	`monthly_rent_cents` integer,
	`paid_on` text,
	`paid_to` text,
	`payment_method` text,
	`move_in_inspection_id` text,
	`move_out_inspection_id` text,
	`tenancy_ended_on` text,
	`amount_requested_back_cents` integer,
	`amount_returned_cents` integer,
	`status` text DEFAULT 'held' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deposit_owner_idx` ON `deposit_record` (`owner_id`);--> statement-breakpoint
CREATE TABLE `dispute_case` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`dispute_type` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`investigation_id` text,
	`tenancy_id` text,
	`maintenance_case_id` text,
	`deposit_id` text,
	`package` text,
	`outstanding_facts` text,
	`excluded_item_ids` text DEFAULT '[]' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dispute_owner_idx` ON `dispute_case` (`owner_id`);--> statement-breakpoint
CREATE TABLE `inspection` (
	`id` text PRIMARY KEY NOT NULL,
	`tenancy_id` text NOT NULL,
	`kind` text NOT NULL,
	`inspected_on` text,
	`landlord_present` integer,
	`witness_name` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`official_form_completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`tenancy_id`) REFERENCES `tenancy`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inspection_tenancy_idx` ON `inspection` (`tenancy_id`);--> statement-breakpoint
CREATE TABLE `inspection_image` (
	`id` text PRIMARY KEY NOT NULL,
	`inspection_item_id` text NOT NULL,
	`document_id` text NOT NULL,
	`caption` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`inspection_item_id`) REFERENCES `inspection_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inspection_image_item_idx` ON `inspection_image` (`inspection_item_id`);--> statement-breakpoint
CREATE TABLE `inspection_item` (
	`id` text PRIMARY KEY NOT NULL,
	`inspection_id` text NOT NULL,
	`room` text NOT NULL,
	`room_label` text,
	`item_name` text NOT NULL,
	`condition` text NOT NULL,
	`description` text,
	`pre_existing` integer DEFAULT false NOT NULL,
	`repair_promised` integer DEFAULT false NOT NULL,
	`repair_due_date` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inspection_item_inspection_idx` ON `inspection_item` (`inspection_id`);--> statement-breakpoint
CREATE TABLE `lease` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`investigation_id` text,
	`title` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lease_owner_idx` ON `lease` (`owner_id`);--> statement-breakpoint
CREATE TABLE `lease_clause` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_version_id` text NOT NULL,
	`clause_type` text NOT NULL,
	`heading` text,
	`text` text NOT NULL,
	`page` integer,
	`start_offset` integer,
	`end_offset` integer,
	`classification` text NOT NULL,
	`explanation` text,
	`rule_key` text,
	`citation_url` text,
	FOREIGN KEY (`lease_version_id`) REFERENCES `lease_version`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lease_clause_version_idx` ON `lease_clause` (`lease_version_id`);--> statement-breakpoint
CREATE TABLE `lease_version` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`version` integer NOT NULL,
	`document_id` text,
	`document_version_id` text,
	`evidence_id` text,
	`text_content` text NOT NULL,
	`page_texts` text,
	`extraction_status` text NOT NULL,
	`terms` text,
	`analysis` text,
	`analyzed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lease_id`) REFERENCES `lease`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lease_version_uq` ON `lease_version` (`lease_id`,`version`);--> statement-breakpoint
CREATE TABLE `maintenance_case` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`tenancy_id` text,
	`inspection_item_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`discovered_on` text,
	`reported_on` text,
	`promised_by` text,
	`confirmed_resolved_on` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_owner_idx` ON `maintenance_case` (`owner_id`);--> statement-breakpoint
CREATE TABLE `maintenance_event` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_on` text NOT NULL,
	`description` text NOT NULL,
	`promised_date` text,
	`document_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `maintenance_case`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_event_case_idx` ON `maintenance_event` (`case_id`);--> statement-breakpoint
CREATE TABLE `tenancy` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`investigation_id` text,
	`label` text NOT NULL,
	`address` text,
	`landlord_name` text,
	`landlord_contact` text,
	`lease_type` text DEFAULT 'unknown' NOT NULL,
	`start_date` text,
	`end_date` text,
	`move_in_date` text,
	`monthly_rent_cents` integer,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenancy_owner_idx` ON `tenancy` (`owner_id`);