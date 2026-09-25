/**
 * MCP Tools: Kanban Pipeline Configuration
 *
 * Implements:
 * 1. airtable_configure_kanban: Stage grouping and front-of-card field badges
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';

export function registerKanbanTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool: airtable_configure_kanban
  server.tool(
    'airtable_configure_kanban',
    `Configures an existing Kanban board page in Interface Designer by setting the stage-stacking singleSelect column and enabling front-of-card badges via Chrome CDP browser automation.

### When to Use
- When customizing an operational Kanban pipeline (e.g. Lead Pipeline, Candidate Tracker, Merchant Onboarding).
- When grouping vertical Kanban stacks by a specific single-select field (e.g. 'Status', 'Stage', 'Priority').
- When unhiding front-of-card display pills (e.g. Client Name, Gross Volume, Plan Type) so card summaries are visible without opening the record.

### When NOT to Use
- Do NOT use this tool to create a new Kanban interface page from scratch. Use 'airtable_create_interface_page' with layout_type='kanban' first.
- Do NOT use this tool to configure record detail side-sheets or locked columns. Use 'airtable_configure_detail_sheet' or 'airtable_set_field_permissions' instead.

### Operational Disclosures
- **Prerequisites**: Chrome must be open with '--remote-debugging-port=9223' on the target base. A Kanban interface page must already exist.
- **Side Effects**: Clicks into the right-hand properties sidebar, selects the stack-by dropdown, and toggles card badge visibility.
- **Persistence**: Saved to the interface draft; published live using 'airtable_publish_interface'.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on the target Kanban page)'),
      stack_by_field: z
        .string()
        .describe('Single-select field name used to group columns into vertical stacks (e.g. "Stage", "Status")'),
      card_fields: z
        .array(z.string())
        .optional()
        .describe('Field names to display as visible front-of-card badges (e.g. ["Store Name", "Plan", "Owner"])'),
      cdp_port: z
        .number()
        .optional()
        .describe('Chrome DevTools Protocol port (default: 9223)'),
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
