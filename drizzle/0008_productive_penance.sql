CREATE TABLE `ole_farm_configs` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ole_xp_adjustment_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`season` integer NOT NULL,
	`category` text NOT NULL,
	`before_total` integer NOT NULL,
	`adjustment` integer NOT NULL,
	`after_total` integer NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`reward_event_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_xp_adjustment_audit_employee` ON `ole_xp_adjustment_audit` (`owner_id`,`employee_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ole_xp_adjustment_audit_reward` ON `ole_xp_adjustment_audit` (`owner_id`,`reward_event_id`);--> statement-breakpoint
CREATE TABLE `ole_xp_reward_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`season` integer NOT NULL,
	`branch_id` text,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ole_xp_reward_events_owner_key` ON `ole_xp_reward_events` (`owner_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ole_xp_reward_events_employee_season` ON `ole_xp_reward_events` (`owner_id`,`employee_id`,`season`);--> statement-breakpoint
CREATE INDEX `ole_xp_reward_events_season_branch` ON `ole_xp_reward_events` (`owner_id`,`season`,`branch_id`);--> statement-breakpoint
CREATE INDEX `ole_xp_reward_events_ranking` ON `ole_xp_reward_events` (`owner_id`,`season`,`amount`);--> statement-breakpoint
PRAGMA optimize;
