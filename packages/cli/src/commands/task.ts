import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatTask, formatTaskList } from '../output.js';
import { resolveGitContext, formatInferenceNote, type GitInferenceResult } from '../git-inference.js';

function parseTTL(ttl: string): string {
  const match = ttl.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}. Use <number>m, <number>h, or <number>d`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2] as 'm' | 'h' | 'd';
  const ms = { m: 60000, h: 3600000, d: 86400000 }[unit];
  const expiresAt = new Date(Date.now() + value * ms);
  return expiresAt.toISOString();
}

interface InferenceArgs {
  client: MostlyClient;
  cwd?: string;
  noGitContext?: boolean;
  json?: boolean;
  quiet?: boolean;
}

async function inferContext(args: InferenceArgs): Promise<GitInferenceResult> {
  const r = await resolveGitContext({
    cwd: args.cwd ?? process.cwd(),
    client: args.client,
    disabled: !!args.noGitContext,
  });
  if (!args.json && !args.quiet) {
    const note = formatInferenceNote(r);
    if (note) process.stderr.write(note + '\n');
    for (const n of r.notes) process.stderr.write(n + '\n');
  }
  return r;
}

function requireTaskKey(positional: string | undefined, inf: GitInferenceResult): string {
  if (positional) return positional;
  if (inf.taskKey) return inf.taskKey;
  throw new Error('task key required (positional argument or branch like AUTH-1-foo)');
}

export function taskCommand(): Command {
  const cmd = new Command('task').description('Manage tasks');

  // create
  cmd
    .command('create')
    .description('Create a new task')
    .requiredOption('--title <title>', 'Task title')
    .requiredOption('--type <type>', 'Task type (feature, bug, chore, etc.)')
    .option('--project <id>', 'Project ID or key')
    .option('--description <desc>', 'Task description')
    .option('--assignee <id>', 'Assignee principal ID or handle')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const project = opts.project ?? inf.projectKey;
        const actor = opts.actor ?? inf.actorHandle ?? config.actor;
        const body: Record<string, unknown> = { title: opts.title, type: opts.type };
        if (project) body.project_id = project;
        if (opts.description) body.description = opts.description;
        if (opts.assignee) body.assignee_id = opts.assignee;
        // Re-load config with the inferred actor if it differs from the default
        const finalConfig = actor !== config.actor ? loadConfig({ actor }) : config;
        const finalClient = MostlyClient.fromConfig(finalConfig);
        const result = await finalClient.post('/v0/tasks', body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // list
  cmd
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter by status')
    .option('--assignee <id>', 'Filter by assignee ID or handle')
    .option('--project <id>', 'Filter by project ID or key')
    .option('--claimed-by <id>', 'Filter by claimed-by principal')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--limit <limit>', 'Maximum number of results')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const params: Record<string, string> = {};
        if (opts.status) params.status = opts.status;
        if (opts.assignee) params.assignee_id = opts.assignee;
        const project = opts.project ?? inf.projectKey;
        if (project) params.project_id = project;
        if (opts.claimedBy) params.claimed_by_id = opts.claimedBy;
        if (opts.cursor) params.cursor = opts.cursor;
        if (opts.limit) params.limit = opts.limit;
        const result = await client.get('/v0/tasks', params);
        formatTaskList(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // show
  cmd
    .command('show [id]')
    .description('Show a task by key (e.g. AUTH-1) or ULID')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const result = await client.get(`/v0/tasks/${taskId}`);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // edit
  cmd
    .command('edit <id>')
    .description('Edit a task (fetches current version automatically)')
    .option('--title <title>', 'New title')
    .option('--description <desc>', 'New description')
    .option('--type <type>', 'New type')
    .option('--assignee <id>', 'New assignee ID or handle')
    .option('--project <id>', 'New project ID or key')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        // Fetch task first to get current version
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const body: Record<string, unknown> = { expected_version: task.version };
        if (opts.title) body.title = opts.title;
        if (opts.description) body.description = opts.description;
        if (opts.type) body.type = opts.type;
        if (opts.assignee) body.assignee_id = opts.assignee;
        if (opts.project) body.project_id = opts.project;
        const result = await client.patch(`/v0/tasks/${id}`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // claim
  cmd
    .command('claim [id]')
    .description('Claim a task')
    .option('--ttl <duration>', 'Claim TTL (e.g. 30m, 2h, 1d)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const body: Record<string, unknown> = { expected_version: task.version };
        if (opts.ttl) body.claim_expires_at = parseTTL(opts.ttl);
        const result = await client.post(`/v0/tasks/${taskId}/claim`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // renew-claim
  cmd
    .command('renew-claim [id]')
    .description('Renew an existing claim on a task')
    .option('--ttl <duration>', 'New claim TTL (e.g. 30m, 2h, 1d)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const body: Record<string, unknown> = { expected_version: task.version };
        if (opts.ttl) body.claim_expires_at = parseTTL(opts.ttl);
        const result = await client.post(`/v0/tasks/${taskId}/renew-claim`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // release-claim
  cmd
    .command('release-claim [id]')
    .description('Release a claim on a task')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const result = await client.post(`/v0/tasks/${taskId}/release-claim`, {
          expected_version: task.version,
        });
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // start (transition: claimed -> in_progress)
  cmd
    .command('start [id]')
    .description('Transition a task to in_progress (from claimed)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const result = await client.post(`/v0/tasks/${taskId}/transition`, {
          to_status: 'in_progress',
          expected_version: task.version,
        });
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // block (transition: -> blocked)
  cmd
    .command('block [id]')
    .description('Transition a task to blocked')
    .option('--body <reason>', 'Reason for blocking (adds a note update)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const result = await client.post(`/v0/tasks/${taskId}/transition`, {
          to_status: 'blocked',
          expected_version: task.version,
        });
        if (opts.body) {
          await client.post(`/v0/tasks/${taskId}/updates`, {
            kind: 'note',
            body: opts.body,
          });
        }
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // close (transition: -> completed)
  cmd
    .command('close [id]')
    .description('Transition a task to completed')
    .option('--resolution <res>', 'Resolution (default: completed)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const body: Record<string, unknown> = {
          to_status: 'closed',
          expected_version: task.version,
          resolution: opts.resolution ?? 'completed',
        };
        const result = await client.post(`/v0/tasks/${taskId}/transition`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // cancel (transition: -> canceled)
  cmd
    .command('cancel [id]')
    .description('Transition a task to canceled')
    .option('--resolution <res>', 'Resolution (default: wont_do)')
    .option('--no-git-context', 'Disable git-based inference')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const inf = await inferContext({ client, noGitContext: !opts.gitContext, json: opts.json, quiet: opts.quiet });
        const taskId = requireTaskKey(id, inf);
        const { data: task } = await client.get(`/v0/tasks/${taskId}`);
        const body: Record<string, unknown> = {
          to_status: 'canceled',
          expected_version: task.version,
          resolution: opts.resolution ?? 'wont_do',
        };
        const result = await client.post(`/v0/tasks/${taskId}/transition`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // add-update
  cmd
    .command('add-update <id>')
    .description('Add an update (note, comment, etc.) to a task')
    .requiredOption('--kind <kind>', 'Update kind (note, comment, status_change, etc.)')
    .requiredOption('--body <body>', 'Update body text')
    .option('--metadata-json <json>', 'Metadata as a JSON string')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const body: Record<string, unknown> = {
          kind: opts.kind,
          body: opts.body,
        };
        if (opts.metadataJson) body.metadata_json = opts.metadataJson;
        const result = await client.post(`/v0/tasks/${id}/updates`, body);
        if (!opts.quiet) {
          if (opts.json) {
            console.log(JSON.stringify(result.data, null, 2));
          } else {
            console.log('Update added.');
          }
        }
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // reap-expired
  cmd
    .command('reap-expired')
    .description('Reap expired task claims (maintenance)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.post('/v0/maintenance/reap-expired-claims', {});
        if (!opts.quiet) {
          if (opts.json) {
            console.log(JSON.stringify(result.data, null, 2));
          } else {
            console.log('Expired claims reaped.');
            if (result.data && result.data.reaped !== undefined) {
              console.log(`Reaped: ${result.data.reaped}`);
            }
          }
        }
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  return cmd;
}
