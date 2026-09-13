CREATE TABLE `ole_sop_exam_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`question_ids` text NOT NULL,
	`audience_type` text DEFAULT 'all' NOT NULL,
	`audience_values` text DEFAULT '[]' NOT NULL,
	`starts_at` text NOT NULL,
	`due_at` text NOT NULL,
	`question_count` integer NOT NULL,
	`pass_score` integer DEFAULT 80 NOT NULL,
	`retake_wait_days` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_sop_exam_plans_owner_status` ON `ole_sop_exam_plans` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `ole_sop_exam_plans_owner_due` ON `ole_sop_exam_plans` (`owner_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `ole_sop_topic_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`topic_code` text NOT NULL,
	`category_id` text NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`steps` text NOT NULL,
	`audiences` text DEFAULT '[]' NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`recommended` integer DEFAULT false NOT NULL,
	`document_version` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`change_note` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_sop_topic_versions_owner_topic` ON `ole_sop_topic_versions` (`owner_id`,`topic_code`,`created_at`);--> statement-breakpoint
CREATE INDEX `ole_sop_topic_versions_owner_state` ON `ole_sop_topic_versions` (`owner_id`,`state`,`created_at`);--> statement-breakpoint
ALTER TABLE `ole_sop_attempts` ADD `plan_id` text;