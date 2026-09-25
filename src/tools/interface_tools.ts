/**
 * MCP Tools: Interface Designer Page Creation & Rebranding
 *
 * Implements:
 * 1. airtable_create_interface_page: Creates Dashboard, Kanban, Grid, or Record Review pages
 * 2. airtable_rebrand_interface: Renames top header and sidebar folder bundles
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';
import type { InterfaceLayoutType } from '../types/index.js';

export function registerInterfaceTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool: airtable_create_interface_page
  server.tool(
    'airtable_create_interface_page',
    `Creates a new Interface Designer page (Dashboard, Kanban, Grid, or Record Review) inside an Airtable base using Chrome DevTools Protocol (CDP) browser automation.

### When to Use
- When building frontend web interfaces for your Airtable base so non-technical users or clients can interact with data without touching raw tables.
- When creating an Executive Dashboard with KPI summary cards, a Kanban board stacked by status, or a high-density Review Queue.
- When expanding an existing interface application with a new page.

### When NOT to Use
- Do NOT use this tool to create backend database tables or columns. Use 'airtable_create_base_schema' or 'airtable_modify_schema' instead.
- Do NOT use this tool to configure Kanban stacking options on an existing page. Use 'airtable_configure_kanban' instead.
- Do NOT use this tool to publish interface draft changes to users. Use 'airtable_publish_interface' instead.

### Operational Disclosures
- **Prerequisites**: Requires Google Chrome running locally with remote debugging enabled (e.g. '--remote-debugging-port=9223') and an active Airtable login session.
- **Side Effects**: Automatically opens or switches to the base's Interface Designer in Chrome, toggles Edit Mode, and creates a draft page.
- **Persistence**: Changes remain in draft state until published using 'airtable_publish_interface'.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      page_name: z
        .string()
        .describe('Display name for the new interface page (e.g. "Merchant Pipeline", "Executive Overview")'),
      layout_type: z
        .enum(['dashboard', 'kanban', 'grid', 'record_review'])
        .describe(
          'Interface page archetype: "dashboard" (KPI metrics), "kanban" (status cards), "grid" (tabular sheet), "record_review" (split master-detail queue)'
        ),
      table_name: z
        .string()
        .describe('Source table name feeding records to this interface page'),
      cdp_port: z
        .number()
        .optional()
        .describe('Chrome DevTools Protocol port (default: 9223 or AIRTABLE_CDP_PORT)'),
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

  // Tool: airtable_rebrand_interface
  server.tool(
    'airtable_rebrand_interface',
    `Renames the top-level interface brand title and sidebar navigation folder bundle via double-click CDP automation.

### When to Use
- When customizing an interface for a specific client brand, department, or internal application name (e.g. changing 'Untitled interface' to 'Vape Runners Merchant Portal').
- When organizing sidebar pages into logical folders or bundles.

### When NOT to Use
- Do NOT use this tool to rename tables or fields. Use 'airtable_modify_schema' instead.
- Do NOT use this tool to create new interface pages. Use 'airtable_create_interface_page' instead.

### Operational Disclosures
- **Prerequisites**: Chrome running with '--remote-debugging-port=9223'.
- **Side Effects**: Selects and double-clicks the interface header title element and/or sidebar group label, committing new string values.
- **Persistence**: Saved to interface draft; must be published to become visible to end-users.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      title: z
        .string()
        .optional()
        .describe('New display title for the top interface header banner'),
      sidebar_bundle_name: z
        .string()
        .optional()
        .describe('New title for the sidebar page navigation folder bundle'),
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
