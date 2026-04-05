import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const taskKeySequences = sqliteTable('task_key_sequence', {
  workspace_id: text('workspace_id').notNull(),
  prefix: text('prefix').notNull(),
  next_number: integer('next_number').notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.workspace_id, table.prefix] }),
]);
