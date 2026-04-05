import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MostlyMcpClient } from './client.js';

export function registerTools(server: McpServer, client: MostlyMcpClient): void {
  server.tool(
    'mostly_list_tasks',
    'List tasks with optional filters',
    {
      status: z.string().optional().describe('Filter by status'),
      assignee_id: z.string().optional().describe('Filter by assignee'),
      project_id: z.string().optional().describe('Filter by project'),
      claimed_by_id: z.string().optional().describe('Filter by claim holder'),
      cursor: z.string().optional().describe('Pagination cursor'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const queryParams: Record<string, string> = {};
      if (params.status) queryParams.status = params.status;
      if (params.assignee_id) queryParams.assignee_id = params.assignee_id;
      if (params.project_id) queryParams.project_id = params.project_id;
      if (params.claimed_by_id) queryParams.claimed_by_id = params.claimed_by_id;
      if (params.cursor) queryParams.cursor = params.cursor;
      if (params.limit) queryParams.limit = String(params.limit);

      const result = await client.get('/v0/tasks', queryParams);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_get_task',
    'Get a task by ID or key',
    {
      id: z.string().describe('Task ID (ULID) or key (e.g., AUTH-1)'),
    },
    async (params) => {
      const result = await client.get(`/v0/tasks/${params.id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_create_task',
    'Create a new task',
    {
      title: z.string().describe('Task title'),
      type: z.string().describe('Task type (feature, bug, chore, etc.)'),
      project_id: z.string().optional().describe('Project ID or key'),
      description: z.string().optional().describe('Task description'),
      assignee_id: z.string().optional().describe('Assignee principal ID or handle'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        title: params.title,
        type: params.type,
      };
      if (params.project_id) body.project_id = params.project_id;
      if (params.description) body.description = params.description;
      if (params.assignee_id) body.assignee_id = params.assignee_id;

      const result = await client.post('/v0/tasks', body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_edit_task',
    'Edit an existing task',
    {
      id: z.string().describe('Task ID (ULID) or key'),
      expected_version: z.number().describe('Expected current version for optimistic locking'),
      title: z.string().optional().describe('New title'),
      type: z.string().optional().describe('New type'),
      description: z.string().optional().describe('New description'),
      assignee_id: z.string().optional().describe('New assignee ID or handle'),
      project_id: z.string().optional().describe('New project ID or key'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        expected_version: params.expected_version,
      };
      if (params.title) body.title = params.title;
      if (params.type) body.type = params.type;
      if (params.description) body.description = params.description;
      if (params.assignee_id) body.assignee_id = params.assignee_id;
      if (params.project_id) body.project_id = params.project_id;

      const result = await client.patch(`/v0/tasks/${params.id}`, body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_transition_task',
    'Transition a task to a new status',
    {
      id: z.string().describe('Task ID (ULID) or key'),
      to_status: z.enum(['open', 'claimed', 'in_progress', 'blocked', 'closed', 'canceled']).describe('Target status'),
      resolution: z.enum(['completed', 'duplicate', 'invalid', 'wont_do', 'deferred']).optional().describe('Resolution for terminal statuses'),
      expected_version: z.number().describe('Expected current version for optimistic locking'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        to_status: params.to_status,
        expected_version: params.expected_version,
      };
      if (params.resolution) body.resolution = params.resolution;

      const result = await client.post(`/v0/tasks/${params.id}/transition`, body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_claim_task',
    'Claim a task for exclusive work',
    {
      id: z.string().describe('Task ID (ULID) or key'),
      expected_version: z.number().describe('Expected current version for optimistic locking'),
      claim_expires_at: z.string().optional().describe('ISO 8601 datetime when the claim expires'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        expected_version: params.expected_version,
      };
      if (params.claim_expires_at) body.claim_expires_at = params.claim_expires_at;

      const result = await client.post(`/v0/tasks/${params.id}/claim`, body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_renew_claim',
    'Renew an existing claim on a task',
    {
      id: z.string().describe('Task ID (ULID) or key'),
      expected_version: z.number().describe('Expected current version for optimistic locking'),
      claim_expires_at: z.string().optional().describe('ISO 8601 datetime for the new claim expiry'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        expected_version: params.expected_version,
      };
      if (params.claim_expires_at) body.claim_expires_at = params.claim_expires_at;

      const result = await client.post(`/v0/tasks/${params.id}/renew-claim`, body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_release_claim',
    'Release a claim on a task',
    {
      id: z.string().describe('Task ID (ULID) or key'),
      expected_version: z.number().describe('Expected current version for optimistic locking'),
    },
    async (params) => {
      const result = await client.post(`/v0/tasks/${params.id}/release-claim`, {
        expected_version: params.expected_version,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_add_task_update',
    'Add an update (note, comment, etc.) to a task',
    {
      task_id: z.string().describe('Task ID (ULID) or key'),
      kind: z.string().describe('Update kind (note, comment, status_change, etc.)'),
      body: z.string().describe('Update body text'),
      metadata_json: z.string().optional().describe('Metadata as a JSON string'),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        kind: params.kind,
        body: params.body,
      };
      if (params.metadata_json) {
        try {
          body.metadata_json = JSON.parse(params.metadata_json);
        } catch {
          return {
            content: [{ type: 'text', text: 'Error: metadata_json is not valid JSON' }],
            isError: true,
          };
        }
      }

      const result = await client.post(`/v0/tasks/${params.task_id}/updates`, body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_list_projects',
    'List all projects',
    {
      cursor: z.string().optional().describe('Pagination cursor'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const queryParams: Record<string, string> = {};
      if (params.cursor) queryParams.cursor = params.cursor;
      if (params.limit) queryParams.limit = String(params.limit);

      const result = await client.get('/v0/projects', queryParams);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_get_project',
    'Get a project by ID or key',
    {
      id: z.string().describe('Project ID (ULID) or key (e.g., AUTH)'),
    },
    async (params) => {
      const result = await client.get(`/v0/projects/${params.id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_list_principals',
    'List all principals (users/agents)',
    {
      cursor: z.string().optional().describe('Pagination cursor'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const queryParams: Record<string, string> = {};
      if (params.cursor) queryParams.cursor = params.cursor;
      if (params.limit) queryParams.limit = String(params.limit);

      const result = await client.get('/v0/principals', queryParams);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'mostly_reap_expired_claims',
    'Reap expired task claims (maintenance operation)',
    {},
    async () => {
      const result = await client.post('/v0/maintenance/reap-expired-claims', {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result?.data ?? result, null, 2) }],
      };
    }
  );
}
