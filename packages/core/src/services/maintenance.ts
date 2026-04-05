import { ulid } from 'ulid';
import type { TaskRepository, TaskUpdateRepository } from '../repositories/index.js';
import { statusAfterClaimRelease } from '../claims.js';

export class MaintenanceService {
  constructor(
    private tasks: TaskRepository,
    private taskUpdates: TaskUpdateRepository,
  ) {}

  async reapExpiredClaims(workspaceId: string): Promise<number> {
    const expiredTasks = await this.tasks.findWithExpiredClaims(workspaceId);
    let count = 0;

    for (const task of expiredTasks) {
      const now = new Date().toISOString();
      const newStatus = statusAfterClaimRelease(task.status);

      await this.tasks.update(task.id, {
        claimed_by_id: null,
        claim_expires_at: null,
        status: newStatus,
        version: task.version + 1,
        updated_by_id: task.claimed_by_id!,
        updated_at: now,
      }, task.version);

      await this.taskUpdates.create({
        id: ulid(),
        task_id: task.id,
        kind: 'system',
        body: `Claim expired and cleared (was held by ${task.claimed_by_id})`,
        metadata_json: null,
        created_by_id: task.claimed_by_id!,
        created_at: now,
      });

      count++;
    }

    return count;
  }
}
