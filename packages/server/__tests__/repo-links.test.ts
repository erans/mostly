import { describe, expect, it, beforeEach } from 'vitest';
import { createTestApp } from './helpers.js';

describe('Repo Link Routes', () => {
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

  // Helper: POST a repo link for a project
  async function postRepoLink(projectId: string, normalized_url: string, subpath = '') {
    return env.app.request(`/v0/projects/${projectId}/repo-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.testAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ normalized_url, subpath, actor_id: env.testPrincipalId }),
    });
  }

  beforeEach(() => {
    env = createTestApp();
  });

  describe('POST /v0/projects/:id/repo-links', () => {
    it('creates a link and GET lists it, then DELETE removes it', async () => {
      const project = await createProject('RLCRUD', 'Repo Link CRUD');

      // Create
      const postRes = await postRepoLink(project.id, 'github.com/acme/auth');
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.data.normalized_url).toBe('github.com/acme/auth');
      expect(postBody.data.project_id).toBe(project.id);
      const linkId = postBody.data.id;

      // GET lists the link
      const getRes = await env.app.request(`/v0/projects/${project.id}/repo-links`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data).toHaveLength(1);
      expect(getBody.data[0].id).toBe(linkId);

      // DELETE
      const delRes = await env.app.request(`/v0/projects/${project.id}/repo-links/${linkId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actor_id: env.testPrincipalId }),
      });
      expect(delRes.status).toBe(204);

      // GET shows empty
      const getRes2 = await env.app.request(`/v0/projects/${project.id}/repo-links`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(getRes2.status).toBe(200);
      const getBody2 = await getRes2.json();
      expect(getBody2.data).toHaveLength(0);
    });

    it('is idempotent: linking same (url, subpath) twice to same project returns same id', async () => {
      const project = await createProject('RLIDEM', 'Repo Link Idempotent');

      const res1 = await postRepoLink(project.id, 'github.com/acme/billing');
      expect(res1.status).toBe(200);
      const body1 = await res1.json();

      const res2 = await postRepoLink(project.id, 'github.com/acme/billing');
      expect(res2.status).toBe(200);
      const body2 = await res2.json();

      expect(body1.data.id).toBe(body2.data.id);
    });

    it('returns 409 when (url, subpath) already linked to a different project', async () => {
      const proj1 = await createProject('RLCONF1', 'Conflict Project 1');
      const proj2 = await createProject('RLCONF2', 'Conflict Project 2');

      const res1 = await postRepoLink(proj1.id, 'github.com/acme/shared');
      expect(res1.status).toBe(200);

      const res2 = await postRepoLink(proj2.id, 'github.com/acme/shared');
      expect(res2.status).toBe(409);
      const body = await res2.json();
      expect(body.error.code).toBe('conflict');
    });

    it('returns 400 when body is invalid (url has scheme)', async () => {
      const project = await createProject('RLINVALID', 'Invalid URL Project');
      const res = await env.app.request(`/v0/projects/${project.id}/repo-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.testAgentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          normalized_url: 'https://github.com/acme/auth',
          subpath: '',
          actor_id: env.testPrincipalId,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_argument');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await postRepoLink('proj_nonexistent', 'github.com/acme/nothing');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v0/repo-links', () => {
    it('lists all links across the workspace', async () => {
      const proj1 = await createProject('RLWS1', 'Workspace List 1');
      const proj2 = await createProject('RLWS2', 'Workspace List 2');

      await postRepoLink(proj1.id, 'github.com/acme/rl-a');
      await postRepoLink(proj2.id, 'github.com/acme/rl-b');

      const res = await env.app.request('/v0/repo-links', {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      const urls = body.data.map((l: any) => l.normalized_url);
      expect(urls).toContain('github.com/acme/rl-a');
      expect(urls).toContain('github.com/acme/rl-b');
    });
  });

  describe('GET /v0/projects/:id/repo-links', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await env.app.request('/v0/projects/someproject/repo-links');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /v0/projects/:id/repo-links/:linkId', () => {
    it('returns 404 when DELETE references a link that belongs to a different project', async () => {
      const projA = await createProject('RLDELA', 'Delete Auth Project A');
      const projB = await createProject('RLDELB', 'Delete Auth Project B');

      // Create a link on project A
      const postRes = await postRepoLink(projA.id, 'github.com/acme/del-auth');
      expect(postRes.status).toBe(200);
      const linkId = (await postRes.json()).data.id;

      // Attempt to DELETE via project B's path — should be 404
      const delRes = await env.app.request(`/v0/projects/${projB.id}/repo-links/${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env.testAgentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: env.testPrincipalId }),
      });
      expect(delRes.status).toBe(404);

      // Link should still exist under project A
      const getRes = await env.app.request(`/v0/projects/${projA.id}/repo-links`, {
        headers: { Authorization: `Bearer ${env.testAgentToken}` },
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.map((l: any) => l.id)).toContain(linkId);
    });

    it('returns 404 when DELETE references a non-existent link', async () => {
      const project = await createProject('RLDELNE', 'Delete Non-Existent Link');
      const fakeId = 'rl_nonexistent000000000000';

      const delRes = await env.app.request(`/v0/projects/${project.id}/repo-links/${fakeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env.testAgentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: env.testPrincipalId }),
      });
      expect(delRes.status).toBe(404);
    });
  });
});
