CREATE TABLE `ole_notification_deliveries` (
	`owner_id` text NOT NULL,
	`notification_key` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `notification_key`)
);
--> statement-breakpoint
CREATE INDEX `ole_notification_deliveries_sent_at` ON `ole_notification_deliveries` (`sent_at`);