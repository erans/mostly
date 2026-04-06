import { ulid } from 'ulid';
import type { TaskRepository, TaskUpdateRepository, TransactionManager } from '../repositories/index.js';
import { statusAfterClaimRelease } from '../claims.js';

const SYSTEM_ACTOR = '__system__';

export class MaintenanceService {
  constructor(
    private tasks: TaskRepository,
    private taskUpdates: TaskUpdateRepository,
    private tx?: TransactionManager,
  ) {}

  async reapExpiredClaims(workspaceId: string): Promise<number> {
    const expiredTasks = await this.tasks.findWithExpiredClaims(workspaceId);
    let count = 0;

    for (const task of expiredTasks) {
      const reap = async (taskRepo: TaskRepository, updateRepo: TaskUpdateRepository) => {
        const now = new Date().toISOString();
        const newStatus = statusAfterClaimRelease(task.status);

        await taskRepo.update(task.id, {
          claimed_by_id: null,
          claim_expires_at: null,
          status: newStatus,
          version: task.version + 1,
          updated_by_id: SYSTEM_ACTOR,
          updated_at: now,
        }, task.version);

        await updateRepo.create({
          id: ulid(),
          task_id: task.id,
          kind: 'system',
          body: `Claim expired and cleared (was held by ${task.claimed_by_id})`,
          metadata_json: null,
          created_by_id: SYSTEM_ACTOR,
          created_at: now,
        });
      };

      if (this.tx) {
        await this.tx.withTransaction(async (ctx) => {
          await reap(ctx.tasks, ctx.taskUpdates);
        });
      } else {
        await reap(this.tasks, this.taskUpdates);
      }

      count++;
    }

    return count;
  }
}
