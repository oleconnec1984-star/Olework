CREATE TABLE `ole_sop_media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ole_sop_media_owner_uploaded` ON `ole_sop_media` (`owner_id`,`uploaded_at`);--> statement-breakpoint
ALTER TABLE `ole_sop_topic_versions` ADD `step_media` text DEFAULT '[]' NOT NULL;