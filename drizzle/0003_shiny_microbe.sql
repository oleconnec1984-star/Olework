ALTER TABLE `ole_employee_sessions` ADD `last_seen_at` text;--> statement-breakpoint
CREATE INDEX `ole_employee_sessions_presence` ON `ole_employee_sessions` (`owner_id`,`last_seen_at`);