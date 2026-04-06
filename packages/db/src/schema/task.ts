import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspace';

export const tasks = sqliteTable('task', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  project_id: text('project_id'),
  key: text('key').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  assignee_id: text('assignee_id'),
  claimed_by_id: text('claimed_by_id'),
  claim_expires_at: text('claim_expires_at'),
  version: integer('version').notNull().default(1),
  created_by_id: text('created_by_id').notNull(),
  updated_by_id: text('updated_by_id').notNull(),
  resolved_at: text('resolved_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  index('task_workspace_status_idx').on(table.workspace_id, table.status),
  uniqueIndex('task_workspace_key_idx').on(table.workspace_id, table.key),
  index('task_workspace_assignee_idx').on(table.workspace_id, table.assignee_id),
  index('task_workspace_claimed_idx').on(table.workspace_id, table.claimed_by_id),
  index('task_workspace_project_idx').on(table.workspace_id, table.project_id),
]);
