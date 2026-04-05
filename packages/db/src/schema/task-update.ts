import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { tasks } from './task';

export const taskUpdates = sqliteTable('task_update', {
  id: text('id').primaryKey(),
  task_id: text('task_id').notNull().references(() => tasks.id),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  metadata_json: text('metadata_json'),
  created_by_id: text('created_by_id').notNull(),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('task_update_task_id_idx').on(table.task_id),
]);
