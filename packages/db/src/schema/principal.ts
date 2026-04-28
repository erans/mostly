import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspace';

export const principals = sqliteTable('principal', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  handle: text('handle').notNull(),
  kind: text('kind').notNull(),
  display_name: text('display_name'),
  email: text('email'),
  metadata_json: text('metadata_json'),
  password_hash: text('password_hash'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  is_admin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('principal_workspace_handle_idx').on(table.workspace_id, table.handle),
]);
