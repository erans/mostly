import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { principals } from './principal';
import { workspaces } from './workspace';

export const sessions = sqliteTable('session', {
  id: text('id').primaryKey(),
  principal_id: text('principal_id').notNull().references(() => principals.id),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('session_principal_id_idx').on(table.principal_id),
]);
