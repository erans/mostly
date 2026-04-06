import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { McpTestRunner } from '../setup/mcp-runner.js';
import { client } from '../setup/test-client.js';

describe('MCP tools', () => {
  const mcp = new McpTestRunner();
  const actor = 'e2e-agent';
  let projectId: string;

  beforeAll(async () => {
    projectId = (await client.post('/v0/projects', {
      key: 'MCP', name: 'MCP Test Project', actor_handle: actor,
    })).data.id;
    await mcp.start();
  });

  afterAll(async () => { await mcp.stop(); });

  it('lists available tools', async () => {
    const result = await mcp.send('tools/list', {});
    expect(result.tools).toBeDefined();
    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('mostly_list_tasks');
    expect(toolNames).toContain('mostly_create_task');
    expect(toolNames).toContain('mostly_get_task');
  });

  it('creates a task via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_create_task',
      arguments: { title: 'MCP created task', type: 'feature', project_id: projectId },
    });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.data.title).toBe('MCP created task');
    expect(data.data.key).toBe('MCP-1');
  });

  it('lists tasks via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_list_tasks',
      arguments: { project_id: projectId },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a task via MCP tool', async () => {
    const result = await mcp.send('tools/call', {
      name: 'mostly_get_task',
      arguments: { id: 'MCP-1' },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe('MCP created task');
  });
});
