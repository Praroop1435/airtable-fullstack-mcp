/**
 * MCP Tools: Schema & Table Provisioning, Inspection & Evolution
 *
 * Implements:
 * 1. airtable_create_base_schema: Base-level table and field batch provisioning
 * 2. airtable_list_schema: Base structure inspection via Metadata API
 * 3. airtable_modify_schema: Field addition, field renaming, and table updates
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirtableApiClient } from '../client/airtable_api.js';
import type { AirtableTableConfig, AirtableFieldConfig } from '../types/index.js';

export function registerSchemaTools(
  server: McpServer,
  apiClient: AirtableApiClient
) {
  // Tool: airtable_create_base_schema
  server.tool(
    'airtable_create_base_schema',
    `Provisions multiple tables and custom fields in an Airtable base using the official Metadata API. Supports singleLineText, singleSelect, currency, number, formula, checkbox, multipleRecordLinks, and more.

### When to Use
- When initializing a new application, portal, or workflow with multiple relational tables.
- When creating tables with customized field types, select choices, or currency configurations.
- When establishing the core data schema before building Interface Designer pages.

### When NOT to Use
- Do NOT use this tool to add a single field to an existing table. Use 'airtable_modify_schema' instead.
- Do NOT use this tool to insert records. Use 'airtable_batch_upsert' instead.
- Do NOT use this tool to inspect table field IDs. Use 'airtable_list_schema' instead.

### Operational Disclosures
- **Side Effects**: Creates permanent tables and field columns in the target Airtable base.
- **Persistence**: Irreversible via this tool; created tables must be deleted manually from the Airtable UI if abandoned.
- **Rate Limits**: Tables are created sequentially with 250ms spacing to prevent Metadata API 429 rate limit errors.
- **Auth Scopes**: Requires Personal Access Token with 'schema.bases:write' scope.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      tables: z
        .array(
          z.object({
            name: z.string().describe('Table name, e.g. "Merchants", "Orders", "Payouts"'),
            description: z
              .string()
              .optional()
              .describe('Table documentation and operational purpose description'),
            fields: z
              .array(
                z.object({
                  name: z.string().describe('Field column name'),
                  type: z
                    .string()
                    .describe(
                      'Field type: singleLineText, multilineText, richText, number, currency, percent, singleSelect, multipleSelects, date, dateTime, phoneNumber, email, url, checkbox, multipleRecordLinks, formula'
                    ),
                  description: z
                    .string()
                    .optional()
                    .describe('Field description explaining data validation or usage'),
                  options: z
                    .record(z.any())
                    .optional()
                    .describe(
                      'Type-specific options, e.g. choices: [{name: "Stage 1", color: "blueBright"}], precision: 2, symbol: "$"'
                    ),
                })
              )
              .describe('Array of field definitions for this table'),
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

  // Tool: airtable_list_schema
  server.tool(
    'airtable_list_schema',
    `Retrieves the complete schema structure of an Airtable base (all tables, field names, field IDs, field types, select options, and views) via the Metadata API.

### When to Use
- When discovering existing table names, primary fields, or field types before performing queries or updates.
- When you need field IDs (starts with 'fld...') or table IDs (starts with 'tbl...') for interface or webhook configurations.
- When validating that newly provisioned tables and fields exist.

### When NOT to Use
- Do NOT use this tool to inspect row values or records. Use 'airtable_query_records' instead.
- Do NOT use this tool to add or modify fields. Use 'airtable_modify_schema' instead.

### Operational Disclosures
- **Side Effects**: Read-only. Safe to call repeatedly with zero base mutations.
- **Auth Scopes**: Requires Personal Access Token with 'schema.bases:read' scope.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
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
                    views: t.views?.map((v: any) => ({
                      id: v.id,
                      name: v.name,
                      type: v.type,
                    })),
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

  // Tool: airtable_modify_schema
  server.tool(
    'airtable_modify_schema',
    `Evolves an existing Airtable schema: adds new custom fields to an existing table, updates field names/descriptions, or updates table names/descriptions via Metadata API.

### When to Use
- When adding a new column/field to an existing table without recreating the whole base.
- When renaming a field or table to improve operational clarity.
- When updating field or table documentation descriptions.

### When NOT to Use
- Do NOT use this tool to initialize an entire new base schema with multiple tables. Use 'airtable_create_base_schema' instead.
- Do NOT use this tool to update row values or cell data. Use 'airtable_manage_records' instead.

### Operational Disclosures
- **Side Effects**: 'create_field' adds a persistent new column. 'update_field' and 'update_table' mutate existing schema metadata.
- **Persistence**: Schema modifications are immediately persistent across all base views and interfaces.
- **Auth Scopes**: Requires Personal Access Token with 'schema.bases:write' scope.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      table_id_or_name: z
        .string()
        .describe('Target Table Name or Table ID (starts with tbl)'),
      action: z
        .enum(['create_field', 'update_field', 'update_table'])
        .describe(
          "Action to perform: 'create_field' adds a new column, 'update_field' modifies field metadata, 'update_table' modifies table metadata"
        ),
      field_config: z
        .object({
          name: z.string().describe('New field name'),
          type: z.string().describe('New field type (e.g. singleLineText, currency, singleSelect)'),
          description: z.string().optional().describe('New field description'),
          options: z.record(z.any()).optional().describe('Field type options'),
        })
        .optional()
        .describe("Field configuration object (required when action is 'create_field')"),
      field_id: z
        .string()
        .optional()
        .describe("Target Field ID (starts with fld, required when action is 'update_field')"),
      update_config: z
        .object({
          name: z.string().optional().describe('Updated name for the field or table'),
          description: z.string().optional().describe('Updated description for the field or table'),
        })
        .optional()
        .describe(
          "Metadata updates to apply (required when action is 'update_field' or 'update_table')"
        ),
    },
    async ({ base_id, table_id_or_name, action, field_config, field_id, update_config }) => {
      try {
        if (action === 'create_field') {
          if (!field_config) {
            throw new Error("field_config is required when action is 'create_field'");
          }
          const created = await apiClient.createField(
            base_id,
            table_id_or_name,
            field_config as AirtableFieldConfig
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully created field '${field_config.name}' in table '${table_id_or_name}'`,
                    field: created,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (action === 'update_field') {
          if (!field_id) {
            throw new Error("field_id is required when action is 'update_field'");
          }
          if (!update_config) {
            throw new Error("update_config is required when action is 'update_field'");
          }
          const updated = await apiClient.updateField(
            base_id,
            table_id_or_name,
            field_id,
            update_config
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully updated field ${field_id}`,
                    field: updated,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (action === 'update_table') {
          if (!update_config) {
            throw new Error("update_config is required when action is 'update_table'");
          }
          const updated = await apiClient.updateTable(
            base_id,
            table_id_or_name,
            update_config
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully updated table '${table_id_or_name}'`,
                    table: updated,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        throw new Error(`Unsupported schema action '${action}'`);
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Schema modification '${action}' failed on ${table_id_or_name}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
