import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { serveCommand } from './commands/serve.js';
import { principalCommand } from './commands/principal.js';
import { projectCommand } from './commands/project.js';
import { taskCommand } from './commands/task.js';

const program = new Command()
  .name('mostly')
  .description('Mostly Linear - local task tracking for agents and humans')
  .version('0.0.1');

program.addCommand(initCommand());
program.addCommand(serveCommand());
program.addCommand(principalCommand());
program.addCommand(projectCommand());
program.addCommand(taskCommand());

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
