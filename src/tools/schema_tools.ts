/**
 * MCP Tools: Schema & Table Provisioning
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirtableApiClient } from '../client/airtable_api.js';
import type { AirtableTableConfig } from '../types/index.js';

export function registerSchemaTools(
  server: McpServer,
  apiClient: AirtableApiClient
) {
  // Tool 1: airtable_create_base_schema
  server.tool(
    'airtable_create_base_schema',
    'Creates tables and fields in an Airtable base using the official Metadata API. Supports singleLineText, singleSelect, currency, number, formula, checkbox, multipleRecordLinks, and more.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      tables: z
        .array(
          z.object({
            name: z.string().describe('Table name'),
            description: z.string().optional().describe('Table description'),
            fields: z
              .array(
                z.object({
                  name: z.string().describe('Field name'),
                  type: z.string().describe('Field type (e.g. singleLineText, singleSelect, currency, formula, etc.)'),
                  description: z.string().optional().describe('Field description'),
                  options: z.record(z.any()).optional().describe('Field options (e.g. choices, format, linkedTableId)'),
                })
              )
              .describe('Array of field definitions'),
          })
        )
        .describe('List of table configurations with name, description, and field definitions'),
    },
    async ({ base_id, tables }) => {
      try {
        const created = await apiClient.createTables(base_id, tables as AirtableTableConfig[]);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully created ${created.length} table(s) in base ${base_id}`,
                  tables: created,
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
              text: `Error creating schema in base ${base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 2: airtable_list_schema
  server.tool(
    'airtable_list_schema',
    'Retrieves the complete schema (tables, fields, views) of an Airtable base using the Metadata API.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
    },
    async ({ base_id }) => {
      try {
        const schema = await apiClient.listBaseSchema(base_id);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id,
                  tables: schema.tables?.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    fieldCount: t.fields?.length,
                    fields: t.fields?.map((f: any) => ({
                      id: f.id,
                      name: f.name,
                      type: f.type,
                      options: f.options,
                    })),
                    viewCount: t.views?.length,
                  })),
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
              text: `Error listing schema for base ${base_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
