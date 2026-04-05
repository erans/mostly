import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, MostlyMcpClient } from './client.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

const config = loadConfig();
const client = new MostlyMcpClient(config);

const server = new McpServer({
  name: 'mostly',
  version: '0.0.1',
});

registerTools(server, client);
registerResources(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
