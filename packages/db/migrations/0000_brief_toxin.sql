CREATE TABLE `agent_action_context` (
	`id` text PRIMARY KEY NOT NULL,
	`task_update_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`session_id` text,
	`run_id` text,
	`tool_name` text,
	`tool_call_id` text,
	`source_kind` text,
	`source_ref` text,
	`metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_update_id`) REFERENCES `task_update`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `principal` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`handle` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`metadata_json` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `principal_workspace_handle_idx` ON `principal` (`workspace_id`,`handle`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`updated_by_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_workspace_key_idx` ON `project` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `task_key_sequence` (
	`workspace_id` text NOT NULL,
	`prefix` text NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`workspace_id`, `prefix`)
);
--> statement-breakpoint
CREATE TABLE `task_update` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`metadata_json` text,
	`created_by_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_update_task_id_idx` ON `task_update` (`task_id`);--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`assignee_id` text,
	`claimed_by_id` text,
	`claim_expires_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_id` text NOT NULL,
	`updated_by_id` text NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_workspace_status_idx` ON `task` (`workspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_workspace_key_idx` ON `task` (`workspace_id`,`key`);--> statement-breakpoint
CREATE INDEX `task_workspace_assignee_idx` ON `task` (`workspace_id`,`assignee_id`);--> statement-breakpoint
CREATE INDEX `task_workspace_claimed_idx` ON `task` (`workspace_id`,`claimed_by_id`);--> statement-breakpoint
CREATE INDEX `task_workspace_project_idx` ON `task` (`workspace_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);