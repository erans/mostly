import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('POST /v0/git-context/resolve', () => {
  let env: ReturnType<typeof createTestApp>;

  // Helper: create a project and return its data
  async function createProject(key: string, name: string) {
    const res = await env.app.request('/v0/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, name, actor_id: env.testPrincipalId }),
    });
    expect(res.status).toBe(200);
    return (await res.json()).data;
  }

  // Helper: create a repo link for a project
  async function createLink(projectId: string, normalized_url: string, subpath = '') {
    const res = await env.app.request(`/v0/projects/${projectId}/repo-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ normalized_url, subpath, actor_id: env.testPrincipalId }),
    });
    expect(res.status).toBe(200);
    return (await res.json()).data;
  }

  // Helper: POST to /v0/git-context/resolve
  // The agent-token middleware requires actor_id/actor_handle in POST bodies;
  // we include actor_id here to satisfy that requirement (the route itself ignores it).
  async function resolve(body: unknown, token?: string) {
    const bodyWithActor = { actor_id: env.testPrincipalId, ...(body as object) };
    return env.app.request('/v0/git-context/resolve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyWithActor),
    });
  }

  beforeEach(() => {
    env = createTestApp();
  });

  it('returns null when no link matches', async () => {
    const res = await resolve({ urls: ['github.com/acme/none'], rel_path: '' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it('resolves to the linked project', async () => {
    const project = await createProject('GCRESOLVE', 'Git Context Resolve');
    await createLink(project.id, 'github.com/acme/auth');

    const res = await resolve({ urls: ['github.com/acme/auth'], rel_path: '' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toBeNull();
    expect(body.data.project_id).toBe(project.id);
    expect(body.data.project_key).toBe('GCRESOLVE');
    expect(body.data.matched_url).toBe('github.com/acme/auth');
    expect(body.data.matched_subpath).toBe('');
    expect(typeof body.data.link_id).toBe('string');
  });

  it('400 on ambiguous match: two projects, two links with same subpath, both URLs sent', async () => {
    const projA = await createProject('GCAMB1', 'Ambiguous Project 1');
    const projB = await createProject('GCAMB2', 'Ambiguous Project 2');
    await createLink(projA.id, 'github.com/acme/mono-a');
    await createLink(projB.id, 'github.com/acme/mono-b');

    // Both links have subpath '' (same length), so sending both URLs triggers ambiguity
    const res = await resolve({
      urls: ['github.com/acme/mono-a', 'github.com/acme/mono-b'],
      rel_path: '',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_argument');
  });

  it('rel_path is optional and defaults to "" (resolves identically to passing rel_path: "")', async () => {
    const project = await createProject('GCRELPATH', 'Git Context RelPath');
    await createLink(project.id, 'github.com/acme/defaults');

    // With explicit rel_path: ''
    const resExplicit = await resolve({ urls: ['github.com/acme/defaults'], rel_path: '' });
    expect(resExplicit.status).toBe(200);
    const bodyExplicit = await resExplicit.json();

    // Without rel_path (should default to '')
    const resOmitted = await resolve({ urls: ['github.com/acme/defaults'] });
    expect(resOmitted.status).toBe(200);
    const bodyOmitted = await resOmitted.json();

    expect(bodyOmitted.data.project_id).toBe(bodyExplicit.data.project_id);
    expect(bodyOmitted.data.link_id).toBe(bodyExplicit.data.link_id);
  });

  it('400 on invalid body: empty body', async () => {
    const res = await resolve({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_argument');
  });

  it('400 on invalid body: urls is empty array', async () => {
    const res = await resolve({ urls: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_argument');
  });

  it('401 when unauthenticated', async () => {
    const res = await env.app.request('/v0/git-context/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['github.com/acme/auth'], rel_path: '' }),
    });
    expect(res.status).toBe(401);
  });
});
