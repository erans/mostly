export { DrizzleWorkspaceRepository } from './workspace.js';
export { DrizzlePrincipalRepository } from './principal.js';
export { DrizzleProjectRepository } from './project.js';
export { DrizzleTaskRepository } from './task.js';
export { DrizzleTaskUpdateRepository } from './task-update.js';
export { DrizzleTransactionManager } from './transaction.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../schema/index.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';
import { DrizzleTransactionManager } from './transaction.js';

export function createRepositories(db: BetterSQLite3Database<typeof schema>) {
  return {
    workspaces: new DrizzleWorkspaceRepository(db),
    principals: new DrizzlePrincipalRepository(db),
    projects: new DrizzleProjectRepository(db),
    tasks: new DrizzleTaskRepository(db),
    taskUpdates: new DrizzleTaskUpdateRepository(db),
  };
}

export function createTransactionManager(db: BetterSQLite3Database<typeof schema>) {
  return new DrizzleTransactionManager(db);
}
