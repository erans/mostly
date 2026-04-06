import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Workers D1 API', () => {
  let mf: Miniflare;
  const TOKEN = 'test-worker-token';
  const WORKSPACE_ID = 'ws_d1test_000001';

  beforeAll(async () => {
    const workerPath = resolve(__dirname, '../../../packages/server/dist/worker.js');

    mf = new Miniflare({
      modules: true,
      scriptPath: workerPath,
      d1Databases: ['DB'],
      bindings: {
        MOSTLY_TOKEN: TOKEN,
        WORKSPACE_ID: WORKSPACE_ID,
      },
      compatibilityDate: '2024-12-01',
      compatibilityFlags: ['nodejs_compat'],
    });

    // Apply migrations to D1
    const db = await mf.getD1Database('DB');
    const migrationSql = readFileSync(
      resolve(__dirname, '../../../packages/db/migrations/0000_brief_toxin.sql'),
      'utf-8'
    );
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      await db.exec(stmt);
    }

    // Seed workspace
    const now = new Date().toISOString();
    await db.exec(`INSERT INTO workspace (id, slug, name, created_at, updated_at) VALUES ('${WORKSPACE_ID}', 'default', 'D1 Test', '${now}', '${now}')`);

    // Seed bootstrap principal
    await db.exec(`INSERT INTO principal (id, workspace_id, handle, kind, display_name, metadata_json, is_active, created_at, updated_at) VALUES ('prin_d1test_000001', '${WORKSPACE_ID}', 'd1-agent', 'agent', 'D1 Agent', NULL, 1, '${now}', '${now}')`);
  }, 30000);

  afterAll(async () => {
    await mf.dispose();
  });

  function headers(): HeadersInit {
    return {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  it('healthcheck works through Workers', async () => {
    const res = await mf.dispatchFetch('http://localhost/healthz');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
  });

  it('lists principals', async () => {
    const res = await mf.dispatchFetch('http://localhost/v0/principals', {
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(body.data.items.some((p: any) => p.handle === 'd1-agent')).toBe(true);
  });

  it('creates a project', async () => {
    const res = await mf.dispatchFetch('http://localhost/v0/projects', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        key: 'D1', name: 'D1 Test Project', actor_handle: 'd1-agent',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.key).toBe('D1');
  });

  it('creates a task', async () => {
    const projRes = await mf.dispatchFetch('http://localhost/v0/projects', {
      headers: headers(),
    });
    const projects = (await projRes.json() as any).data.items;
    const projectId = projects.find((p: any) => p.key === 'D1').id;

    const res = await mf.dispatchFetch('http://localhost/v0/tasks', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title: 'D1 task', type: 'feature', project_id: projectId, actor_handle: 'd1-agent',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.key).toBe('D1-1');
    expect(body.data.status).toBe('open');
  });

  it('claims and transitions a task', async () => {
    const getRes = await mf.dispatchFetch('http://localhost/v0/tasks/D1-1', {
      headers: headers(),
    });
    const task = (await getRes.json() as any).data;

    const claimRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/claim`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        expected_version: task.version, actor_handle: 'd1-agent',
      }),
    });
    expect(claimRes.status).toBe(200);
    const claimed = (await claimRes.json() as any).data;
    expect(claimed.status).toBe('claimed');

    const startRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/transition`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        to_status: 'in_progress', expected_version: claimed.version, actor_handle: 'd1-agent',
      }),
    });
    expect(startRes.status).toBe(200);
    expect((await startRes.json() as any).data.status).toBe('in_progress');
  });

  it('adds and lists task updates', async () => {
    const getRes = await mf.dispatchFetch('http://localhost/v0/tasks/D1-1', {
      headers: headers(),
    });
    const task = (await getRes.json() as any).data;

    const updateRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/updates`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        kind: 'note', body: 'D1 test note', actor_handle: 'd1-agent',
      }),
    });
    expect(updateRes.status).toBe(200);

    const listRes = await mf.dispatchFetch(`http://localhost/v0/tasks/${task.id}/updates`, {
      headers: headers(),
    });
    expect(listRes.status).toBe(200);
    const updates = (await listRes.json() as any).data;
    expect(updates.items.some((u: any) => u.body === 'D1 test note')).toBe(true);
  });
});
