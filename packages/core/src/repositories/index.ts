export type * from './types.js';
export type * from './workspace.js';
export type * from './principal.js';
export type * from './project.js';
export type * from './task.js';
export type * from './task-update.js';

import type { TaskRepository } from './task.js';
import type { TaskUpdateRepository } from './task-update.js';
import type { ProjectRepository } from './project.js';
import type { PrincipalRepository } from './principal.js';
import type { WorkspaceRepository } from './workspace.js';

export interface TransactionContext {
  tasks: TaskRepository;
  taskUpdates: TaskUpdateRepository;
  projects: ProjectRepository;
  principals: PrincipalRepository;
  workspaces: WorkspaceRepository;
}

export interface TransactionManager {
  withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
