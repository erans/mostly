import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { taskUpdates } from './task-update';

export const agentActionContexts = sqliteTable('agent_action_context', {
  id: text('id').primaryKey(),
  task_update_id: text('task_update_id').notNull().references(() => taskUpdates.id),
  principal_id: text('principal_id').notNull(),
  session_id: text('session_id'),
  run_id: text('run_id'),
  tool_name: text('tool_name'),
  tool_call_id: text('tool_call_id'),
  source_kind: text('source_kind'),
  source_ref: text('source_ref'),
  metadata_json: text('metadata_json'),
  created_at: text('created_at').notNull(),
});
