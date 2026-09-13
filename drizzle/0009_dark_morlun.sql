CREATE TABLE `ole_permission_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`permission` text NOT NULL,
	`enabled` integer NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_permission_audit_employee` ON `ole_permission_audit` (`owner_id`,`employee_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `ole_sop_exam_plans` ADD `scope_departments` text DEFAULT '[]' NOT NULL;