import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspace';

export const projects = sqliteTable('project', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  created_by_id: text('created_by_id').notNull(),
  updated_by_id: text('updated_by_id').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('project_workspace_key_idx').on(table.workspace_id, table.key),
]);
