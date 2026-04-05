import type { Task } from '@mostly/types';
import { isTerminal } from './state-machine.js';

export function isClaimActive(task: Task): boolean {
  if (!task.claimed_by_id) return false;
  if (!task.claim_expires_at) return true;
  return new Date(task.claim_expires_at) > new Date();
}

export function isClaimExpired(task: Task): boolean {
  if (!task.claimed_by_id) return false;
  if (!task.claim_expires_at) return false;
  return new Date(task.claim_expires_at) <= new Date();
}

export function canAcquireClaim(task: Task): boolean {
  if (isTerminal(task.status)) return false;
  if (isClaimActive(task)) return false;
  // Can only acquire on open or blocked
  return task.status === 'open' || task.status === 'blocked';
}

export function canRenewClaim(task: Task, actorId: string): boolean {
  if (!task.claimed_by_id) return false;
  return task.claimed_by_id === actorId;
}

export function canReleaseClaim(task: Task, actorId: string): boolean {
  if (!task.claimed_by_id) return false;
  return task.claimed_by_id === actorId;
}

export function statusAfterClaimAcquire(currentStatus: string): string {
  if (currentStatus === 'open') return 'claimed';
  return currentStatus; // blocked stays blocked
}

export function statusAfterClaimRelease(currentStatus: string): string {
  if (currentStatus === 'claimed' || currentStatus === 'in_progress') return 'open';
  return currentStatus; // blocked stays blocked
}
