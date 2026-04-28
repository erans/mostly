export type * from './types.js';
export type * from './workspace.js';
export type * from './principal.js';
export type * from './project.js';
export type * from './project-repo-link.js';
export type * from './task.js';
export type * from './task-update.js';
export type * from './session.js';
export type * from './api-key.js';

import type { TaskRepository } from './task.js';
import type { TaskUpdateRepository } from './task-update.js';
import type { ProjectRepository } from './project.js';
import type { ProjectRepoLinkRepository } from './project-repo-link.js';
import type { PrincipalRepository } from './principal.js';
import type { WorkspaceRepository } from './workspace.js';
import type { SessionRepository } from './session.js';
import type { ApiKeyRepository } from './api-key.js';

export interface TransactionContext {
  tasks: TaskRepository;
  taskUpdates: TaskUpdateRepository;
  projects: ProjectRepository;
  projectRepoLinks: ProjectRepoLinkRepository;
  principals: PrincipalRepository;
  workspaces: WorkspaceRepository;
  sessions: SessionRepository;
  apiKeys: ApiKeyRepository;
}

export interface TransactionManager {
  withTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
