import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatProject, formatProjectList } from '../output.js';

export function projectCommand(): Command {
  const cmd = new Command('project').description('Manage projects');

  cmd
    .command('create')
    .description('Create a new project')
    .requiredOption('--key <KEY>', 'Project key (e.g. AUTH)')
    .requiredOption('--name <name>', 'Project name')
    .option('--description <desc>', 'Project description')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.post('/v0/projects', {
          key: opts.key,
          name: opts.name,
          ...(opts.description ? { description: opts.description } : {}),
        });
        formatProject(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List all projects')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.get('/v0/projects');
        formatProjectList(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('show <id>')
    .description('Show a project by key or ULID')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.get(`/v0/projects/${id}`);
        formatProject(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  return cmd;
}
