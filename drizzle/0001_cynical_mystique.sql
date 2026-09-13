CREATE TABLE `ole_employee_accounts` (
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`login_id` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`permissions` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `employee_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ole_employee_login_id_unique` ON `ole_employee_accounts` (`login_id`);--> statement-breakpoint
CREATE TABLE `ole_employee_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_employee_sessions_expiry` ON `ole_employee_sessions` (`expires_at`);