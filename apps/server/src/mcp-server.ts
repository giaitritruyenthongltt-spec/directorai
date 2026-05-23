import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import { mcpTools, buildMcpToolsWithContext, type McpToolDef } from './tool-registry.js';

export interface McpServerOptions {
  logger: Logger;
  adapter: IPremiereAdapter;
  /** When provided, context.* tools are exposed alongside the Premiere ones. */
  contextDispatch?: (method: string, params: unknown) => Promise<unknown>;
  startStdio?: boolean;
}

export interface RunningMcpServer {
  toolCount: number;
  close(): Promise<void>;
}

export async function startMcpServer(opts: McpServerOptions): Promise<RunningMcpServer> {
  const server = new Server(
    { name: 'directorai', version: '0.3.1-context-live' },
    { capabilities: { tools: {} } }
  );

  const allTools: McpToolDef[] = opts.contextDispatch
    ? buildMcpToolsWithContext(opts.contextDispatch)
    : mcpTools;

  const tools: Tool[] = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const tool = allTools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      };
    }
    try {
      const result = await tool.run(req.params.arguments ?? {}, opts.adapter);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      opts.logger.warn({ tool: req.params.name, err }, 'Tool call failed');
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: err instanceof Error ? err.message : 'Unknown error',
          },
        ],
      };
    }
  });

  if (opts.startStdio ?? false) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  return {
    toolCount: tools.length,
    close: () => server.close(),
  };
}
