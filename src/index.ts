#!/usr/bin/env node

/**
 * Airtable Full-Stack MCP Server
 *
 * The World's First Dual-Engine Airtable Model Context Protocol Server:
 * Engine 1: Schema & Data (Official REST & Metadata APIs)
 * Engine 2: Interface Designer (Headless/Headed Chrome DevTools Protocol & Playwright)
 *
 * Author: Praroop Anand (Praroop1435)
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AirtableApiClient } from './client/airtable_api.js';
import { BrowserCdpClient } from './client/browser_cdp.js';
import { registerSchemaTools } from './tools/schema_tools.js';
import { registerDataTools } from './tools/data_tools.js';
import { registerAutomationTools } from './tools/automation_tools.js';
import { registerInterfaceTools } from './tools/interface_tools.js';
import { registerKanbanTools } from './tools/kanban_tools.js';
import { registerPermissionTools } from './tools/permission_tools.js';

async function main() {
  const server = new McpServer({
    name: 'airtable-fullstack-mcp',
    version: '1.1.1',
    description:
      "The world's first dual-engine Airtable MCP server: unified REST & Metadata APIs, real-time Webhooks, In-Base Automation Scripting, full Record CRUD, and Chrome CDP Interface Designer automation (Dashboards, Kanbans, Column Edit Locks, and Publishing).",
  });

  const apiClient = new AirtableApiClient();
  const cdpClient = new BrowserCdpClient();

  // Register all dual-engine tools (14 total)
  registerSchemaTools(server, apiClient);
  registerDataTools(server, apiClient);
  registerAutomationTools(server, apiClient);
  registerInterfaceTools(server, cdpClient);
  registerKanbanTools(server, cdpClient);
  registerPermissionTools(server, cdpClient);

  // Connect via standard stdio transport for Claude Desktop / Cursor / Antigravity
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Airtable Full-Stack MCP] Server running on stdio transport');
}

main().catch((err) => {
  console.error('[Airtable Full-Stack MCP] Fatal server error:', err);
  process.exit(1);
});
