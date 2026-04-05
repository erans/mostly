import { describe, expect, it } from 'vitest';
import {
  CreatePrincipalRequest,
  PatchPrincipalRequest,
  CreateProjectRequest,
  PatchProjectRequest,
  CreateTaskRequest,
  PatchTaskRequest,
  TransitionTaskRequest,
  AcquireClaimRequest,
  RenewClaimRequest,
  ReleaseClaimRequest,
  CreateTaskUpdateRequest,
  ApiResponse,
  ApiListResponse,
  ApiErrorResponse,
} from '../src/api.js';

describe('API schemas', () => {
  it('CreatePrincipalRequest validates', () => {
    const result = CreatePrincipalRequest.safeParse({
      handle: 'eran',
      kind: 'human',
      display_name: 'Eran',
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(true);
  });

  it('CreatePrincipalRequest rejects missing handle', () => {
    const result = CreatePrincipalRequest.safeParse({
      kind: 'human',
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(false);
  });

  it('CreateTaskRequest validates with project', () => {
    const result = CreateTaskRequest.safeParse({
      type: 'bug',
      title: 'Fix login',
      project_id: '01JQXYZ1234567890ABCDEF',
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(true);
  });

  it('TransitionTaskRequest validates', () => {
    const result = TransitionTaskRequest.safeParse({
      to_status: 'closed',
      resolution: 'completed',
      expected_version: 3,
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(true);
  });

  it('TransitionTaskRequest rejects invalid status', () => {
    const result = TransitionTaskRequest.safeParse({
      to_status: 'done',
      expected_version: 3,
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(false);
  });

  it('AcquireClaimRequest validates without expiry', () => {
    const result = AcquireClaimRequest.safeParse({
      expected_version: 1,
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(true);
  });

  it('CreateTaskUpdateRequest validates', () => {
    const result = CreateTaskUpdateRequest.safeParse({
      kind: 'progress',
      body: 'Making progress.',
      actor_id: '01JQXYZ1234567890ABCDEF',
    });
    expect(result.success).toBe(true);
  });

  it('CreateTaskUpdateRequest validates with agent contexts', () => {
    const result = CreateTaskUpdateRequest.safeParse({
      kind: 'progress',
      body: 'Done with tool calls.',
      actor_id: '01JQXYZ1234567890ABCDEF',
      agent_action_contexts: [
        {
          session_id: 'sess-1',
          tool_name: 'bash',
          tool_call_id: 'call-1',
          source_kind: 'cli_session',
          source_ref: 'sess-1',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
