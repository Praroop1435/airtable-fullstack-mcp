/**
 * MCP Tools: Kanban Pipeline Configuration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';

export function registerKanbanTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool 7: airtable_configure_kanban
  server.tool(
    'airtable_configure_kanban',
    'Configures a Kanban board interface page by setting the stage stacking field and unhiding front-of-card badges via browser automation.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on page)'),
      stack_by_field: z
        .string()
        .describe('Single-select field to group columns by (e.g. Stage, Status)'),
      card_fields: z
        .array(z.string())
        .optional()
        .describe('Field names to display on cards (e.g. Store Name, Plan, ID)'),
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

        await cdpClient.ensureEditMode(page, args.base_id, args.page_id);

        const result = await cdpClient.configureKanban(page, {
          stackByField: args.stack_by_field,
          cardFields: args.card_fields,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  stackedField: result.stackedField,
                  cardFieldsConfigured: args.card_fields || [],
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
              text: `Error configuring Kanban for base ${args.base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
