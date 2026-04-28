import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspace';
import { projects } from './project';
import { principals } from './principal';

export const projectRepoLinks = sqliteTable('project_repo_link', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  project_id: text('project_id').notNull().references(() => projects.id),
  normalized_url: text('normalized_url').notNull(),
  subpath: text('subpath').notNull().default(''),
  created_by_id: text('created_by_id').notNull().references(() => principals.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('project_repo_link_url_subpath_idx').on(
    table.workspace_id,
    table.normalized_url,
    table.subpath,
  ),
]);
