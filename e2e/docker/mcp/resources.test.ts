import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { McpTestRunner } from '../setup/mcp-runner.js';
import { client } from '../setup/test-client.js';

describe('MCP resources', () => {
  const mcp = new McpTestRunner();
  const actor = 'e2e-agent';

  beforeAll(async () => {
    const projects = await client.get('/v0/projects');
    if (!projects.data.items.some((p: any) => p.key === 'MCPR')) {
      const proj = (await client.post('/v0/projects', {
        key: 'MCPR', name: 'MCP Resource Test', actor_handle: actor,
      })).data;
      await client.post('/v0/tasks', {
        title: 'Resource test task', type: 'feature', project_id: proj.id, actor_handle: actor,
      });
    }
    await mcp.start();
  });

  afterAll(async () => { await mcp.stop(); });

  it('lists resource templates', async () => {
    const result = await mcp.send('resources/templates/list', {});
    expect(result.resourceTemplates).toBeDefined();
    const uriTemplates = result.resourceTemplates.map((t: any) => t.uriTemplate);
    expect(uriTemplates).toContain('task://{slug}/{key}');
    expect(uriTemplates).toContain('project://{slug}/{key}');
    expect(uriTemplates).toContain('principal://{slug}/{handle}');
  });

  it('reads a task resource', async () => {
    const result = await mcp.send('resources/read', { uri: 'task://default/MCPR-1' });
    expect(result.contents).toBeDefined();
    const data = JSON.parse(result.contents[0].text);
    expect(data.key).toBe('MCPR-1');
  });

  it('reads a principal resource', async () => {
    const result = await mcp.send('resources/read', { uri: 'principal://default/e2e-agent' });
    expect(result.contents).toBeDefined();
    const data = JSON.parse(result.contents[0].text);
    expect(data.handle).toBe('e2e-agent');
  });
});
