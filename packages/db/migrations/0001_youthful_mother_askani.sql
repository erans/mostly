CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`principal_id`) REFERENCES `principal`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_principal_name_idx` ON `api_key` (`principal_id`,`name`);--> statement-breakpoint
CREATE INDEX `api_key_key_hash_idx` ON `api_key` (`key_hash`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`principal_id`) REFERENCES `principal`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_principal_id_idx` ON `session` (`principal_id`);--> statement-breakpoint
ALTER TABLE `principal` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `principal` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `agent_token_hash` text;--> statement-breakpoint
ALTER TABLE `workspace` ADD `allow_registration` integer DEFAULT false NOT NULL;