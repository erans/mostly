import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatTask, formatTaskList } from '../output.js';

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
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const body: Record<string, unknown> = {
          title: opts.title,
          type: opts.type,
        };
        if (opts.project) body.project_id = opts.project;
        if (opts.description) body.description = opts.description;
        if (opts.assignee) body.assignee_id = opts.assignee;
        const result = await client.post('/v0/tasks', body);
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
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const params: Record<string, string> = {};
        if (opts.status) params.status = opts.status;
        if (opts.assignee) params.assignee_id = opts.assignee;
        if (opts.project) params.project_id = opts.project;
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
    .command('show <id>')
    .description('Show a task by key (e.g. AUTH-1) or ULID')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const result = await client.get(`/v0/tasks/${id}`);
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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
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
    .command('claim <id>')
    .description('Claim a task')
    .option('--ttl <duration>', 'Claim TTL (e.g. 30m, 2h, 1d)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const body: Record<string, unknown> = { expected_version: task.version };
        if (opts.ttl) body.claim_expires_at = parseTTL(opts.ttl);
        const result = await client.post(`/v0/tasks/${id}/claim`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // renew-claim
  cmd
    .command('renew-claim <id>')
    .description('Renew an existing claim on a task')
    .option('--ttl <duration>', 'New claim TTL (e.g. 30m, 2h, 1d)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const body: Record<string, unknown> = { expected_version: task.version };
        if (opts.ttl) body.claim_expires_at = parseTTL(opts.ttl);
        const result = await client.post(`/v0/tasks/${id}/renew-claim`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // release-claim
  cmd
    .command('release-claim <id>')
    .description('Release a claim on a task')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const result = await client.post(`/v0/tasks/${id}/release-claim`, {
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
    .command('start <id>')
    .description('Transition a task to in_progress (from claimed)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const result = await client.post(`/v0/tasks/${id}/transition`, {
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
    .command('block <id>')
    .description('Transition a task to blocked')
    .option('--body <reason>', 'Reason for blocking (adds a note update)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const result = await client.post(`/v0/tasks/${id}/transition`, {
          to_status: 'blocked',
          expected_version: task.version,
        });
        if (opts.body) {
          await client.post(`/v0/tasks/${id}/updates`, {
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
    .command('close <id>')
    .description('Transition a task to completed')
    .option('--resolution <res>', 'Resolution (default: completed)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const body: Record<string, unknown> = {
          to_status: 'completed',
          expected_version: task.version,
          resolution: opts.resolution ?? 'completed',
        };
        const result = await client.post(`/v0/tasks/${id}/transition`, body);
        formatTask(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // cancel (transition: -> cancelled)
  cmd
    .command('cancel <id>')
    .description('Transition a task to cancelled')
    .option('--resolution <res>', 'Resolution (default: wont_do)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const { data: task } = await client.get(`/v0/tasks/${id}`);
        const body: Record<string, unknown> = {
          to_status: 'cancelled',
          expected_version: task.version,
          resolution: opts.resolution ?? 'wont_do',
        };
        const result = await client.post(`/v0/tasks/${id}/transition`, body);
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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
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
