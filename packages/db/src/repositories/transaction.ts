import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TransactionManager, TransactionContext } from '@mostly/core';
import type * as schema from '../schema/index.js';
import { DrizzleWorkspaceRepository } from './workspace.js';
import { DrizzlePrincipalRepository } from './principal.js';
import { DrizzleProjectRepository } from './project.js';
import { DrizzleTaskRepository } from './task.js';
import { DrizzleTaskUpdateRepository } from './task-update.js';

export class DrizzleTransactionManager implements TransactionManager {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  async withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    this.db.run(sql.raw('BEGIN'));
    const ctx: TransactionContext = {
      tasks: new DrizzleTaskRepository(this.db),
      taskUpdates: new DrizzleTaskUpdateRepository(this.db),
      projects: new DrizzleProjectRepository(this.db),
      principals: new DrizzlePrincipalRepository(this.db),
      workspaces: new DrizzleWorkspaceRepository(this.db),
    };
    try {
      const result = await fn(ctx);
      this.db.run(sql.raw('COMMIT'));
      return result;
    } catch (err) {
      this.db.run(sql.raw('ROLLBACK'));
      throw err;
    }
  }
}
