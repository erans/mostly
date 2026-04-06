import type { Task, TaskStatus, Resolution } from '@mostly/types';
import { TERMINAL_STATUSES, RESOLUTION_FOR_STATUS } from '@mostly/types';

export type SideEffect =
  | { type: 'release_claim' }
  | { type: 'set_resolved_at' }
  | { type: 'clear_expired_claim' };

export type TransitionResult =
  | { valid: true; sideEffects: SideEffect[] }
  | { valid: false; error: string };

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['claimed', 'closed', 'canceled'],
  claimed: ['in_progress', 'blocked', 'open', 'closed', 'canceled'],
  in_progress: ['blocked', 'open', 'closed', 'canceled'],
  blocked: ['claimed', 'in_progress', 'open', 'closed', 'canceled'],
};

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function isClaimActive(task: Task): boolean {
  if (!task.claimed_by_id) return false;
  if (!task.claim_expires_at) return true;
  return new Date(task.claim_expires_at) > new Date();
}

function isClaimExpired(task: Task): boolean {
  if (!task.claimed_by_id) return false;
  if (!task.claim_expires_at) return false;
  return new Date(task.claim_expires_at) <= new Date();
}

export function validateTransition(
  task: Task,
  toStatus: string,
  resolution: string | null,
  actorId: string,
): TransitionResult {
  const fromStatus = task.status;

  // Terminal states cannot transition
  if (isTerminal(fromStatus)) {
    return { valid: false, error: `cannot transition from terminal state ${fromStatus}` };
  }

  // Check allowed transitions
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    return { valid: false, error: `transition from ${fromStatus} to ${toStatus} is not allowed` };
  }

  const sideEffects: SideEffect[] = [];
  const hasActiveClaim = isClaimActive(task);
  const hasExpiredClaim = isClaimExpired(task);

  // If the claim is expired, treat as absent and schedule cleanup
  if (hasExpiredClaim) {
    sideEffects.push({ type: 'clear_expired_claim' });
  }

  const effectivelyHasClaim = hasActiveClaim && !hasExpiredClaim;

  // Resolution validation for terminal states
  if (isTerminal(toStatus)) {
    if (!resolution) {
      return { valid: false, error: `transition to ${toStatus} requires a resolution` };
    }
    const validResolutions = RESOLUTION_FOR_STATUS[toStatus];
    if (!validResolutions || !(validResolutions as readonly string[]).includes(resolution)) {
      return { valid: false, error: `resolution ${resolution} is not valid for ${toStatus}` };
    }
    sideEffects.push({ type: 'set_resolved_at' });

    // Terminal transition requires no active claim at commit time
    if (effectivelyHasClaim) {
      if (task.claimed_by_id === actorId) {
        // Actor is the claimer - atomic release
        sideEffects.push({ type: 'release_claim' });
      } else {
        return { valid: false, error: 'cannot transition to terminal state while another principal holds the claim' };
      }
    }
  } else {
    // Non-terminal transition must not have resolution
    if (resolution) {
      return { valid: false, error: 'resolution must be null for non-terminal transitions' };
    }
  }

  // Specific transition rules
  if (fromStatus === 'blocked') {
    if (toStatus === 'open') {
      // blocked -> open requires active claim (claimer releasing)
      if (!effectivelyHasClaim) {
        return { valid: false, error: 'blocked -> open requires an active claim (claimer releasing)' };
      }
      sideEffects.push({ type: 'release_claim' });
    }

    if (toStatus === 'claimed') {
      // blocked -> claimed requires NO active claim
      if (effectivelyHasClaim) {
        return { valid: false, error: 'blocked -> claimed requires no active claim' };
      }
    }

    if (toStatus === 'in_progress') {
      // blocked -> in_progress requires active claim
      if (!effectivelyHasClaim) {
        return { valid: false, error: 'blocked -> in_progress requires an active claim' };
      }
    }
  }

  // Transitions to open from claimed/in_progress release the claim
  if (toStatus === 'open' && (fromStatus === 'claimed' || fromStatus === 'in_progress')) {
    if (!sideEffects.some(e => e.type === 'release_claim')) {
      sideEffects.push({ type: 'release_claim' });
    }
  }

  return { valid: true, sideEffects };
}
