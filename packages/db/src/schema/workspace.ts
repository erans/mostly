import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
