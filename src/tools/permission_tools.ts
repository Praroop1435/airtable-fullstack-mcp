/**
 * MCP Tools: Field Permissions, Detail Sheets & Interface Publishing
 *
 * Implements:
 * 1. airtable_set_field_permissions: Column-level inline edit locking (Edit this column inline = OFF)
 * 2. airtable_configure_detail_sheet: Side-sheet record detail card configuration and field switches
 * 3. airtable_publish_interface: Finalizing and publishing draft interfaces
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';

export function registerPermissionTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool: airtable_set_field_permissions
  server.tool(
    'airtable_set_field_permissions',
    `Sets column-level inline editing permissions on Grid and Record Review interfaces by toggling "Edit this column inline" ON or OFF via Chrome CDP browser automation.

### When to Use
- When locking permanent identifiers (e.g. ID, Receipt Number, Stripe Charge ID) so operational users cannot accidentally edit them.
- When protecting raw intake submissions or financial calculations from tampering.
- When keeping decision gates (e.g. Stage dropdown, Verification Checkbox, Review Notes) editable while keeping all other columns read-only.

### When NOT to Use
- Do NOT use this tool for Kanban front-of-card badges. Use 'airtable_configure_kanban' instead.
- Do NOT use this tool to configure side-sheet popup field editability. Use 'airtable_configure_detail_sheet' instead.

### Operational Disclosures
- **Prerequisites**: Chrome running with '--remote-debugging-port=9223' with an open Interface Designer Grid or Review Queue page.
- **Side Effects**: Selects table column headers and toggles the inline editing switch in the right-hand properties sidebar.
- **Persistence**: Saved to interface draft; published live using 'airtable_publish_interface'.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on the target page)'),
      locked_columns: z
        .array(z.string())
        .optional()
        .describe(
          'Column names to LOCK from inline editing (sets "Edit this column inline" = OFF), e.g. ["Merchant ID", "Monthly SaaS Fee"]'
        ),
      editable_columns: z
        .array(z.string())
        .optional()
        .describe(
          'Column names to ALLOW inline editing (sets "Edit this column inline" = ON), e.g. ["Stage", "Reviewer Notes"]'
        ),
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

        const lockedResults: Record<string, boolean> = {};
        if (args.locked_columns) {
          for (const col of args.locked_columns) {
            lockedResults[col] = await cdpClient.setColumnInlineEditing(
              page,
              col,
              false
            );
          }
        }

        const editableResults: Record<string, boolean> = {};
        if (args.editable_columns) {
          for (const col of args.editable_columns) {
            editableResults[col] = await cdpClient.setColumnInlineEditing(
              page,
              col,
              true
            );
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  lockedColumns: lockedResults,
                  editableColumns: editableResults,
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
              text: `Error setting column permissions for base ${args.base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool: airtable_configure_detail_sheet
  server.tool(
    'airtable_configure_detail_sheet',
    `Configures the expandable record detail side-sheet: enables record click-to-open and toggles field-level lock switches within the detail view via Chrome CDP browser automation.

### When to Use
- When setting up the opening detail card that pops out when an operational user clicks a row or Kanban card.
- When locking audit fields, billing totals, and created dates inside the side-sheet while allowing notes or stage toggles.
- When setting the primary header title field of the side-sheet.

### When NOT to Use
- Do NOT use this tool for high-density table column inline edit permissions. Use 'airtable_set_field_permissions' instead.
- Do NOT use this tool to publish interface draft changes. Use 'airtable_publish_interface' instead.

### Operational Disclosures
- **Prerequisites**: Chrome running with '--remote-debugging-port=9223'.
- **Side Effects**: Clicks into the side-sheet configuration pane and adjusts record detail layout switches.
- **Persistence**: Saved to interface draft; published live using 'airtable_publish_interface'.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on the target page)'),
      title_field: z
        .string()
        .optional()
        .describe('Field name to use as the hero title on the detail card (e.g. "Merchant Name")'),
      locked_fields: z
        .array(z.string())
        .optional()
        .describe('Field names to lock from editing within the side-sheet'),
      editable_fields: z
        .array(z.string())
        .optional()
        .describe('Field names to allow editing within the side-sheet'),
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

        const result = await cdpClient.configureDetailSheet(page, {
          base_id: args.base_id,
          page_id: args.page_id,
          title_field: args.title_field,
          locked_fields: args.locked_fields,
          editable_fields: args.editable_fields,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  base_id: args.base_id,
                  detailCardConfigured: true,
                  titleField: args.title_field || null,
                  lockedCount: result.lockedCount,
                  editableCount: result.editableCount,
                  lockedFields: args.locked_fields || [],
                  editableFields: args.editable_fields || [],
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
              text: `Error configuring detail sheet for base ${args.base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool: airtable_publish_interface
  server.tool(
    'airtable_publish_interface',
    `Finalizes and publishes all Interface Designer draft changes to production, confirming any multi-page confirmation modals via Chrome CDP browser automation.

### When to Use
- When you have finished building or modifying interface pages, Kanbans, and permissions, and want live users/clients to see the updates.
- As the final step in any automated interface creation workflow.

### When NOT to Use
- Do NOT use this tool if you are still making edits or adjusting layout elements in draft mode.
- Do NOT use this tool for base schema changes (schema changes are live immediately without publishing).

### Operational Disclosures
- **Prerequisites**: Chrome running with '--remote-debugging-port=9223' on the target base.
- **Side Effects**: Clicks the blue 'Publish' button in the interface header and clicks confirmation dialogs.
- **Persistence**: Publishes all draft changes to all users with interface access.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
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

        const result = await cdpClient.publishInterface(page);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: result.published,
                  base_id: args.base_id,
                  message: result.published
                    ? 'Interface draft published successfully to live users'
                    : 'Publish button was not clickable or interface already up to date',
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
              text: `Error publishing interface for base ${args.base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
