CREATE TABLE `ole_sop_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`score` integer NOT NULL,
	`level` text NOT NULL,
	`critical_passed` integer NOT NULL,
	`correct_count` integer NOT NULL,
	`total_questions` integer NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_sop_attempts_owner_completed` ON `ole_sop_attempts` (`owner_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `ole_sop_attempts_employee_completed` ON `ole_sop_attempts` (`owner_id`,`employee_id`,`completed_at`);