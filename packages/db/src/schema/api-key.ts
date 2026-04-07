import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { principals } from './principal';
import { workspaces } from './workspace';

export const apiKeys = sqliteTable('api_key', {
  id: text('id').primaryKey(),
  principal_id: text('principal_id').notNull().references(() => principals.id),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  key_hash: text('key_hash').notNull(),
  key_prefix: text('key_prefix').notNull(),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  last_used_at: text('last_used_at'),
}, (table) => [
  uniqueIndex('api_key_principal_name_idx').on(table.principal_id, table.name),
  index('api_key_key_hash_idx').on(table.key_hash),
]);
