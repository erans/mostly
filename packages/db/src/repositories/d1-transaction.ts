import type { TransactionManager, TransactionContext } from '@mostly/core';
import type { MostlyDb } from '../types.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';
import { DrizzleSessionRepository } from './session.js';
import { DrizzleApiKeyRepository } from './api-key.js';

/**
 * D1 transaction manager. D1 does not support multi-statement transactions
 * (BEGIN/COMMIT/ROLLBACK). Operations run sequentially. D1's single-writer
 * guarantee prevents concurrent conflicts at the database level.
 */
export class DrizzleD1TransactionManager implements TransactionManager {
  constructor(private db: MostlyDb) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const ctx: TransactionContext = {
      tasks: new DrizzleTaskRepository(this.db),
      taskUpdates: new DrizzleTaskUpdateRepository(this.db),
      projects: new DrizzleProjectRepository(this.db),
      principals: new DrizzlePrincipalRepository(this.db),
      workspaces: new DrizzleWorkspaceRepository(this.db),
      sessions: new DrizzleSessionRepository(this.db),
      apiKeys: new DrizzleApiKeyRepository(this.db),
    };
    return fn(ctx);
  }
}
