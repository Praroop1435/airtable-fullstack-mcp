/**
 * MCP Tools: Field Permissions, Detail Sheets, and Publishing
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserCdpClient } from '../client/browser_cdp.js';

export function registerPermissionTools(
  server: McpServer,
  cdpClient: BrowserCdpClient
) {
  // Tool 8: airtable_set_field_permissions
  server.tool(
    'airtable_set_field_permissions',
    'Sets column-level inline editing permissions on Grid and Review Queue interfaces. Locks permanent IDs and ingest fields while keeping decision gates editable.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on page)'),
      locked_columns: z
        .array(z.string())
        .optional()
        .describe('Column names to LOCK from inline editing (Edit this column inline = OFF)'),
      editable_columns: z
        .array(z.string())
        .optional()
        .describe('Column names to ALLOW inline editing (Edit this column inline = ON)'),
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

  // Tool 9: airtable_configure_detail_sheet
  server.tool(
    'airtable_configure_detail_sheet',
    'Configures the opening record detail side-sheet: enables detail card clicks and toggles field-level lock switches.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      page_id: z
        .string()
        .optional()
        .describe('Interface Page ID (optional if already on page)'),
      title_field: z
        .string()
        .optional()
        .describe('Field to display as main header of the side-sheet'),
      locked_fields: z
        .array(z.string())
        .optional()
        .describe('Fields inside the detail side-sheet to lock (Allow inline editing = OFF)'),
      editable_fields: z
        .array(z.string())
        .optional()
        .describe('Fields inside the detail side-sheet to allow editing (Allow inline editing = ON)'),
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

        const result = await cdpClient.configureDetailSheet(page, args);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  detailSideSheetEnabled: true,
                  fieldsLockedCount: result.lockedCount,
                  fieldsEditableCount: result.editableCount,
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

  // Tool 10: airtable_publish_interface
  server.tool(
    'airtable_publish_interface',
    'Finalizes and publishes all Interface Designer draft changes to production, confirming any confirmation modals.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
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
