/**
 * MCP Tools: Interface Designer Page Creation & Rebranding
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';
import type { InterfaceLayoutType } from '../types/index.js';

export function registerInterfaceTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool 5: airtable_create_interface_page
  server.tool(
    'airtable_create_interface_page',
    'Creates a new Interface Designer page (Dashboard, Kanban, Grid, Record Review) via Chrome CDP browser automation.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      page_name: z.string().describe('Display name for the new interface page'),
      layout_type: z
        .enum(['dashboard', 'kanban', 'grid', 'record_review'])
        .describe('Interface archetype layout'),
      table_name: z.string().describe('Source table name for this page data'),
      cdp_port: z
        .number()
        .optional()
        .describe('Chrome DevTools Protocol port (default 9223 or AIRTABLE_CDP_PORT)'),
    },
    async (args) => {
      try {
        const { page } = await cdpClient.getAirtablePage(
          args.base_id,
          args.cdp_port
        );

        await cdpClient.ensureEditMode(page, args.base_id);

        const result = await cdpClient.createInterfacePage(page, {
          pageName: args.page_name,
          layoutType: args.layout_type as InterfaceLayoutType,
          tableName: args.table_name,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  page_name: args.page_name,
                  layout_type: args.layout_type,
                  table_name: args.table_name,
                  pageUrl: result.pageUrl,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error creating interface page '${args.page_name}': ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 6: airtable_rebrand_interface
  server.tool(
    'airtable_rebrand_interface',
    'Rebrands the top interface title and sidebar page bundle folder name via double-click automation.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      title: z.string().optional().describe('New title for the interface header'),
      sidebar_bundle_name: z
        .string()
        .optional()
        .describe('New name for the sidebar page group/folder'),
      cdp_port: z
        .number()
        .optional()
        .describe('Chrome DevTools Protocol port (default 9223)'),
    },
    async (args) => {
      try {
        const { page } = await cdpClient.getAirtablePage(
          args.base_id,
          args.cdp_port
        );

        await cdpClient.ensureEditMode(page, args.base_id);

        const result = await cdpClient.rebrandInterface(page, {
          title: args.title,
          sidebarBundleName: args.sidebar_bundle_name,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error rebranding interface for base ${args.base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
