import { describe, expect, it } from 'vitest';
import {
  WorkspaceSchema,
  PrincipalSchema,
  ProjectSchema,
  TaskSchema,
  TaskUpdateSchema,
  AgentActionContextSchema,
} from '../src/schemas.js';

describe('entity schemas', () => {
  const now = new Date().toISOString();

  it('WorkspaceSchema validates a valid workspace', () => {
    const result = WorkspaceSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      slug: 'default',
      name: 'Default',
      allow_registration: false,
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(true);
  });

  it('WorkspaceSchema rejects missing slug', () => {
    const result = WorkspaceSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      name: 'Default',
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(false);
  });

  it('PrincipalSchema validates a valid principal', () => {
    const result = PrincipalSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      handle: 'claude-code',
      kind: 'agent',
      display_name: 'Claude Code',
      metadata_json: null,
      is_active: true,
      is_admin: false,
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(true);
  });

  it('PrincipalSchema rejects invalid kind', () => {
    const result = PrincipalSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      handle: 'claude-code',
      kind: 'robot',
      display_name: 'Claude Code',
      metadata_json: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(false);
  });

  it('ProjectSchema validates a valid project', () => {
    const result = ProjectSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      key: 'AUTH',
      name: 'Authentication',
      description: null,
      is_archived: false,
      created_by_id: '01JQXYZ1234567890ABCDEF',
      updated_by_id: '01JQXYZ1234567890ABCDEF',
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(true);
  });

  it('ProjectSchema rejects lowercase key', () => {
    const result = ProjectSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      key: 'auth',
      name: 'Authentication',
      description: null,
      is_archived: false,
      created_by_id: '01JQXYZ1234567890ABCDEF',
      updated_by_id: '01JQXYZ1234567890ABCDEF',
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(false);
  });

  it('TaskSchema validates a valid task', () => {
    const result = TaskSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      project_id: null,
      key: 'TASK-1',
      type: 'bug',
      title: 'Fix race condition',
      description: 'Token rotation has a race.',
      status: 'open',
      resolution: null,
      assignee_id: null,
      claimed_by_id: null,
      claim_expires_at: null,
      version: 1,
      created_by_id: '01JQXYZ1234567890ABCDEF',
      updated_by_id: '01JQXYZ1234567890ABCDEF',
      resolved_at: null,
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(true);
  });

  it('TaskSchema rejects invalid status', () => {
    const result = TaskSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      workspace_id: '01JQXYZ1234567890ABCDEF',
      project_id: null,
      key: 'TASK-1',
      type: 'bug',
      title: 'Fix race',
      description: null,
      status: 'pending',
      resolution: null,
      assignee_id: null,
      claimed_by_id: null,
      claim_expires_at: null,
      version: 1,
      created_by_id: '01JQXYZ1234567890ABCDEF',
      updated_by_id: '01JQXYZ1234567890ABCDEF',
      resolved_at: null,
      created_at: now,
      updated_at: now,
    });
    expect(result.success).toBe(false);
  });

  it('TaskUpdateSchema validates a valid update', () => {
    const result = TaskUpdateSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      task_id: '01JQXYZ1234567890ABCDEF',
      kind: 'progress',
      body: 'Made progress on the thing.',
      metadata_json: null,
      created_by_id: '01JQXYZ1234567890ABCDEF',
      created_at: now,
    });
    expect(result.success).toBe(true);
  });

  it('AgentActionContextSchema validates a valid context', () => {
    const result = AgentActionContextSchema.safeParse({
      id: '01JQXYZ1234567890ABCDEF',
      task_update_id: '01JQXYZ1234567890ABCDEF',
      principal_id: '01JQXYZ1234567890ABCDEF',
      session_id: 'sess-123',
      run_id: null,
      tool_name: 'bash',
      tool_call_id: 'call-456',
      source_kind: 'cli_session',
      source_ref: 'sess-123',
      metadata_json: null,
      created_at: now,
    });
    expect(result.success).toBe(true);
  });
});
