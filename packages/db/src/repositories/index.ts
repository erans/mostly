export { DrizzleWorkspaceRepository } from './workspace.js';
export { DrizzlePrincipalRepository } from './principal.js';
export { DrizzleProjectRepository } from './project.js';
export { DrizzleTaskRepository } from './task.js';
export { DrizzleTaskUpdateRepository } from './task-update.js';
export { DrizzleSessionRepository } from './session.js';
export { DrizzleApiKeyRepository } from './api-key.js';
export { DrizzleLocalTransactionManager } from './transaction.js';
export { DrizzleD1TransactionManager } from './d1-transaction.js';

import type { TransactionManager } from '@mostly/core';
import type { MostlyDb } from '../types.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';
import { DrizzleSessionRepository } from './session.js';
import { DrizzleApiKeyRepository } from './api-key.js';
import { DrizzleLocalTransactionManager } from './transaction.js';
import { DrizzleD1TransactionManager } from './d1-transaction.js';

export function createRepositories(db: MostlyDb) {
  return {
    workspaces: new DrizzleWorkspaceRepository(db),
    principals: new DrizzlePrincipalRepository(db),
    projects: new DrizzleProjectRepository(db),
    tasks: new DrizzleTaskRepository(db),
    taskUpdates: new DrizzleTaskUpdateRepository(db),
    sessions: new DrizzleSessionRepository(db),
    apiKeys: new DrizzleApiKeyRepository(db),
  };
}

export function createTransactionManager(db: MostlyDb) {
  return new DrizzleLocalTransactionManager(db);
}

export function createD1TransactionManager(db: MostlyDb): TransactionManager {
  return new DrizzleD1TransactionManager(db);
}
