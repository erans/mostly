import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { gatherGitContext, RealGitRunner } from '@mostly/core';
import { formatProject, formatProjectList, formatRepoLink, formatRepoLinkList } from '../output.js';

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

  cmd
    .command('link')
    .description("Link the current git repo's remote(s) to a project")
    .option('--project <KEY>', 'Project key (required to link)')
    .option('--subpath <PATH>', 'Subpath within the repo (default: "")', '')
    .option('--remote <NAME>', 'Remote name to link (default: origin)', 'origin')
    .option('--all-remotes', 'Link every remote on the repo')
    .option('--from <PATH>', 'Run as if cwd were PATH')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const cwd = opts.from ?? process.cwd();
        const ctx = await gatherGitContext(cwd, new RealGitRunner());
        if (!ctx) {
          console.error('not in a git repo');
          process.exit(1);
        }
        if (ctx.remotes.length === 0) {
          console.error('repo has no remotes; nothing to link');
          process.exit(1);
        }
        const targets = opts.allRemotes
          ? ctx.remotes
          : ctx.remotes.filter((r) => r.name === opts.remote);
        if (targets.length === 0) {
          console.error(
            `remote "${opts.remote}" not found. available: ${ctx.remotes.map((r) => r.name).join(', ')}`,
          );
          process.exit(1);
        }
        if (!opts.project) {
          console.error('candidate URLs:');
          for (const t of targets) console.error(`  ${t.normalized_url}`);
          console.error('re-run with --project <KEY>');
          process.exit(1);
        }
        const client = MostlyClient.fromConfig(config);
        let anyError = false;
        for (const t of targets) {
          try {
            const result = await client.post(`/v0/projects/${opts.project}/repo-links`, {
              normalized_url: t.normalized_url,
              subpath: opts.subpath ?? '',
            });
            formatRepoLink(result.data, opts);
          } catch (err: any) {
            console.error(`cannot link ${t.normalized_url}: ${err.message}`);
            anyError = true;
          }
        }
        if (anyError) process.exitCode = 1;
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('unlink')
    .description('Remove a repo link')
    .requiredOption('--project <KEY>', 'Project key')
    .option('--remote <NAME>', 'Remote name to unlink (default: origin)', 'origin')
    .option('--subpath <PATH>', 'Subpath of the link (default: "")', '')
    .option('--all', 'Remove every link on the project')
    .option('--from <PATH>', 'Run as if cwd were PATH')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const list = await client.get(`/v0/projects/${opts.project}/repo-links`);
        const links = list.data as Array<any>;
        let toDelete: any[] = [];
        if (opts.all) {
          toDelete = links;
        } else {
          const cwd = opts.from ?? process.cwd();
          const ctx = await gatherGitContext(cwd, new RealGitRunner());
          if (!ctx) {
            console.error('not in a git repo');
            process.exit(1);
          }
          const remote = ctx.remotes.find((r) => r.name === opts.remote);
          if (!remote) {
            console.error(`remote "${opts.remote}" not found`);
            process.exit(1);
          }
          toDelete = links.filter(
            (l) => l.normalized_url === remote.normalized_url && l.subpath === (opts.subpath ?? ''),
          );
          if (toDelete.length === 0) {
            console.error('no matching link');
            process.exit(1);
          }
        }
        for (const l of toDelete) {
          await client.delete(`/v0/projects/${opts.project}/repo-links/${l.id}`);
        }
        if (!opts.quiet) console.error(`unlinked ${toDelete.length}`);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('links')
    .description('List repo links')
    .option('--project <KEY>', 'Restrict to a project; otherwise list all in workspace')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const url = opts.project ? `/v0/projects/${opts.project}/repo-links` : '/v0/repo-links';
        const result = await client.get(url);
        formatRepoLinkList(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  return cmd;
}
