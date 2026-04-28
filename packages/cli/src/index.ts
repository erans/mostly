import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { serveCommand } from './commands/serve.js';
import { principalCommand } from './commands/principal.js';
import { projectCommand } from './commands/project.js';
import { taskCommand } from './commands/task.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { apiKeyCommand } from './commands/api-key.js';
import { inviteCommand } from './commands/invite.js';
import { whereamiCommand } from './commands/whereami.js';

const program = new Command()
  .name('mostly')
  .description('Mostly Linear - local task tracking for agents and humans')
  .version('0.0.1');

program.addCommand(initCommand());
program.addCommand(serveCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(apiKeyCommand());
program.addCommand(inviteCommand());
program.addCommand(principalCommand());
program.addCommand(projectCommand());
program.addCommand(taskCommand());
program.addCommand(whereamiCommand());

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
