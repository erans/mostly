import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MostlyMcpClient } from './client.js';

export function registerResources(server: McpServer, client: MostlyMcpClient): void {
  server.resource(
    'task',
    'task://{slug}/{key}',
    async (uri) => {
      // Parse URI to extract the task key (everything after the second slash)
      const match = uri.href.match(/^task:\/\/[^/]+\/(.+)$/);
      if (!match) throw new Error('Invalid task URI');
      const key = match[1];
      const result = await client.get(`/v0/tasks/${key}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result.data, null, 2),
        }],
      };
    }
  );

  server.resource(
    'project',
    'project://{slug}/{key}',
    async (uri) => {
      // Parse URI to extract the project key
      const match = uri.href.match(/^project:\/\/[^/]+\/(.+)$/);
      if (!match) throw new Error('Invalid project URI');
      const key = match[1];
      const result = await client.get(`/v0/projects/${key}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result.data, null, 2),
        }],
      };
    }
  );

  server.resource(
    'principal',
    'principal://{slug}/{handle}',
    async (uri) => {
      // Parse URI to extract the principal handle
      const match = uri.href.match(/^principal:\/\/[^/]+\/(.+)$/);
      if (!match) throw new Error('Invalid principal URI');
      const handle = match[1];
      const result = await client.get(`/v0/principals/${handle}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result.data, null, 2),
        }],
      };
    }
  );
}
