import { sql } from 'drizzle-orm';
import type { MostlyDb } from '../types.js';
import type { TransactionManager, TransactionContext } from '@mostly/core';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleProjectRepoLinkRepository } from './project-repo-link.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';
import { DrizzleSessionRepository } from './session.js';
import { DrizzleApiKeyRepository } from './api-key.js';

export class DrizzleLocalTransactionManager implements TransactionManager {
  constructor(private db: MostlyDb) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    await this.db.run(sql.raw('BEGIN'));
    const ctx: TransactionContext = {
      tasks: new DrizzleTaskRepository(this.db),
      taskUpdates: new DrizzleTaskUpdateRepository(this.db),
      projects: new DrizzleProjectRepository(this.db),
      projectRepoLinks: new DrizzleProjectRepoLinkRepository(this.db),
      principals: new DrizzlePrincipalRepository(this.db),
      workspaces: new DrizzleWorkspaceRepository(this.db),
      sessions: new DrizzleSessionRepository(this.db),
      apiKeys: new DrizzleApiKeyRepository(this.db),
    };
    try {
      const result = await fn(ctx);
      await this.db.run(sql.raw('COMMIT'));
      return result;
    } catch (err) {
      await this.db.run(sql.raw('ROLLBACK'));
      throw err;
    }
  }
}
