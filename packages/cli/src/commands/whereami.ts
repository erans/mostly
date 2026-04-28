import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { resolveGitContext } from '../git-inference.js';
import { gatherGitContext, RealGitRunner } from '@mostly/core';

export function whereamiCommand(): Command {
  return new Command('whereami')
    .description('Show what Mostly would infer from the current directory')
    .option('--from <PATH>', 'Run as if cwd were PATH')
    .option('--json', 'Output JSON')
    .option('--actor <actor>', 'Actor handle override (does not affect inference)')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const cwd = opts.from ?? process.cwd();
        const ctx = await gatherGitContext(cwd, new RealGitRunner());
        const inf = await resolveGitContext({ cwd, client, disabled: false });
        const out = {
          cwd,
          repo_root: ctx?.repoRoot ?? null,
          rel_path: ctx?.relPath ?? null,
          branch: ctx?.branch ?? null,
          author_email: ctx?.authorEmail ?? null,
          remotes: ctx?.remotes ?? [],
          inferred: {
            project: inf.projectKey ? { key: inf.projectKey, source: inf.source.project } : null,
            task: inf.taskKey ? { key: inf.taskKey, source: inf.source.task } : null,
            actor: inf.actorHandle ? { handle: inf.actorHandle, source: inf.source.actor } : null,
          },
          notes: inf.notes,
        };
        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }
        console.log(`cwd:        ${out.cwd}`);
        console.log(`repo:       ${out.repo_root ?? '(not a git repo)'}`);
        console.log(`rel_path:   ${out.rel_path ?? '-'}`);
        console.log(`branch:     ${out.branch ?? '-'}`);
        console.log(`email:      ${out.author_email ?? '-'}`);
        console.log(`remotes:`);
        for (const r of out.remotes) console.log(`  ${r.name}: ${r.normalized_url}`);
        console.log('inferred:');
        console.log(`  project: ${out.inferred.project ? `${out.inferred.project.key} (${out.inferred.project.source})` : '-'}`);
        console.log(`  task:    ${out.inferred.task ? `${out.inferred.task.key} (${out.inferred.task.source})` : '-'}`);
        console.log(`  actor:   ${out.inferred.actor ? `${out.inferred.actor.handle} (${out.inferred.actor.source})` : '-'}`);
        for (const n of out.notes) console.log(n);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });
}
