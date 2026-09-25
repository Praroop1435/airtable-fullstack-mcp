/**
 * MCP Tools: Data Ingestion, Querying & Record Lifecycle Management
 *
 * Implements:
 * 1. airtable_batch_upsert: Ingestion with 10-record chunking and rate-limit backoff
 * 2. airtable_query_records: Server-side formula filtering and pagination
 * 3. airtable_manage_records: Single/batch record update (PATCH), deletion, and ID lookup
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirtableApiClient } from '../client/airtable_api.js';

export function registerDataTools(
  server: McpServer,
  apiClient: AirtableApiClient
) {
  // Tool: airtable_batch_upsert
  server.tool(
    'airtable_batch_upsert',
    `Ingests or bulk-inserts records into an Airtable table using the REST API with automatic 10-record chunking and 5 req/sec rate limit backoff.

### When to Use
- When bulk-importing rows of data from CSVs, webhooks, or external systems into an Airtable table.
- When creating multiple records in batches of 10 to 1,000+ rows efficiently without manual loop management.
- When inserting structured data where string values for singleSelect or record links should be auto-cast.

### When NOT to Use
- Do NOT use this tool to update or delete a single record by record ID. Use 'airtable_manage_records' instead.
- Do NOT use this tool for reading or filtering existing records. Use 'airtable_query_records' instead.
- Do NOT use this tool to create new tables or modify field schemas. Use 'airtable_create_base_schema' or 'airtable_modify_schema' instead.

### Operational Disclosures
- **Side Effects**: Creates new persistent records in the target table. Does not overwrite existing rows unless fields match Airtable's native upsert performUpsert criteria.
- **Persistence & Idempotency**: Additive mutation. Calling multiple times with identical records will create duplicate records unless an external primary key is deduplicated beforehand.
- **Rate Limiting**: Airtable enforces a strict 5 req/sec limit. This tool chunks records into 10-item payloads and sleeps 210ms between requests, with exponential backoff on HTTP 429.
- **Auth Scopes**: Requires Personal Access Token with 'data.records:write' scope.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      table_name_or_id: z
        .string()
        .describe('Target Table Name (e.g. "Merchants", "Orders") or Table ID (starts with tbl)'),
      records: z
        .array(z.record(z.unknown()))
        .describe(
          'Array of record objects mapping field names to values, e.g. [{"Merchant Name": "Acme", "Stage": "Onboarding"}]'
        ),
      typecast: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'When true, automatically creates new select options or converts string values to linked record arrays (default: true)'
        ),
    },
    async ({ base_id, table_name_or_id, records, typecast = true }) => {
      try {
        const result = await apiClient.batchUpsertRecords(
          base_id,
          table_name_or_id,
          records as Array<Record<string, unknown>>,
          typecast
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id,
                  table: table_name_or_id,
                  insertedCount: result.createdCount,
                  sampleRecordIds: result.records.slice(0, 5).map((r) => r.id),
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
              text: `Error batch upserting into ${table_name_or_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool: airtable_query_records
  server.tool(
    'airtable_query_records',
    `Queries records from an Airtable table with server-side formula filtering, field selection, sorting, and pagination.

### When to Use
- When searching for specific records matching criteria (e.g. stage, status, date range, or email).
- When retrieving record IDs, computed formulas, or linked fields for downstream analysis or updates.
- When inspecting current data density and values across an Airtable base.

### When NOT to Use
- Do NOT use this tool to modify or delete records. Use 'airtable_manage_records' or 'airtable_batch_upsert' instead.
- Do NOT use this tool to inspect table column schemas. Use 'airtable_list_schema' instead.

### Operational Disclosures
- **Side Effects**: Read-only. Safe to invoke repeatedly with zero mutations to the base.
- **Filtering**: Supports standard Airtable formula syntax (e.g. AND({Status} = 'Active', {Balance} > 0)).
- **Pagination**: Automatically paginates using Airtable offset tokens up to max_records.
- **Auth Scopes**: Requires Personal Access Token with 'data.records:read' scope.`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      table_name_or_id: z
        .string()
        .describe('Target Table Name or Table ID'),
      filter_by_formula: z
        .string()
        .optional()
        .describe(
          "Airtable formula to filter records server-side, e.g. \"AND({Stage} = 'Pending', {Amount} > 100)\""
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe('Specific field names to return (saves bandwidth and token usage)'),
      max_records: z
        .number()
        .optional()
        .describe('Maximum total records to retrieve across pages (default: 100)'),
      sort: z
        .array(
          z.object({
            field: z.string().describe('Field name to sort by'),
            direction: z.enum(['asc', 'desc']).optional().describe('Sort direction: "asc" or "desc"'),
          })
        )
        .optional()
        .describe('Sort criteria, e.g. [{"field": "Created", "direction": "desc"}]'),
      view: z
        .string()
        .optional()
        .describe('Specific View name or ID to filter by view configuration'),
    },
    async (args) => {
      try {
        const result = await apiClient.queryRecords(args);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  base_id: args.base_id,
                  table: args.table_name_or_id,
                  totalRetrieved: result.total,
                  records: result.records,
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
              text: `Error querying records from ${args.table_name_or_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool: airtable_manage_records
  server.tool(
    'airtable_manage_records',
    `Performs lifecycle operations on individual or batch records in Airtable: get record by ID, update fields (PATCH), delete single record, or batch delete up to multiple records.

### When to Use
- When updating specific fields on an existing record (e.g. changing Stage from 'Review' to 'Approved').
- When retrieving the full payload of a single record by known record ID (starts with 'rec').
- When permanently deleting one or more records by their record IDs.

### When NOT to Use
- Do NOT use this tool to insert dozens of new rows. Use 'airtable_batch_upsert' instead.
- Do NOT use this tool for formula-based search or multi-record filtering. Use 'airtable_query_records' instead.
- Do NOT use this tool to delete an entire table or change schema definitions. Use 'airtable_modify_schema' instead.

### Operational Disclosures
- **Destructive Behavior**: The 'delete' and 'batch_delete' actions permanently remove records from Airtable (moved to base trash for 7 days).
- **Partial Updates**: The 'update' action performs a PATCH: only specified fields are modified; unmentioned fields retain their existing values.
- **Rate Limits**: Single requests execute in 1 call; 'batch_delete' automatically chunks IDs by 10 and respects the 5 req/sec rate limit.
- **Auth Scopes**: Requires Personal Access Token with 'data.records:write' (or 'data.records:read' for 'get').`,
    {
      base_id: z
        .string()
        .describe('Airtable Base ID (starts with app, e.g. appoorUuG6wgx8dJ1)'),
      table_name_or_id: z
        .string()
        .describe('Target Table Name or Table ID'),
      action: z
        .enum(['get', 'update', 'delete', 'batch_delete'])
        .describe(
          "Action to perform: 'get' retrieves a record, 'update' modifies fields (PATCH), 'delete' removes one record, 'batch_delete' removes an array of records"
        ),
      record_id: z
        .string()
        .optional()
        .describe(
          "Target Record ID starting with 'rec' (required for 'get', 'update', and single 'delete')"
        ),
      record_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Array of Record IDs starting with 'rec' (required when action is 'batch_delete')"
        ),
      fields: z
        .record(z.unknown())
        .optional()
        .describe(
          "Field key-value pairs to update (required when action is 'update'), e.g. {\"Stage\": \"Approved\", \"Reviewer Notes\": \"Verified\"}"
        ),
      typecast: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'When true, automatically creates new select choices or casts strings to linked records (default: true)'
        ),
    },
    async ({ base_id, table_name_or_id, action, record_id, record_ids, fields, typecast = true }) => {
      try {
        if (action === 'get') {
          if (!record_id) {
            throw new Error("record_id is required when action is 'get'");
          }
          const record = await apiClient.getRecord(base_id, table_name_or_id, record_id);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    base_id,
                    table: table_name_or_id,
                    record,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (action === 'update') {
          if (!record_id) {
            throw new Error("record_id is required when action is 'update'");
          }
          if (!fields || Object.keys(fields).length === 0) {
            throw new Error("fields object is required when action is 'update'");
          }
          const updated = await apiClient.updateRecord(
            base_id,
            table_name_or_id,
            record_id,
            fields,
            typecast
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully updated record ${record_id}`,
                    record: updated,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (action === 'delete') {
          if (!record_id) {
            throw new Error("record_id is required when action is 'delete'");
          }
          const res = await apiClient.deleteRecord(base_id, table_name_or_id, record_id);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully deleted record ${record_id}`,
                    deleted: res.deleted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (action === 'batch_delete') {
          if (!record_ids || record_ids.length === 0) {
            throw new Error("record_ids array is required when action is 'batch_delete'");
          }
          const res = await apiClient.batchDeleteRecords(base_id, table_name_or_id, record_ids);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Successfully deleted ${res.deletedCount} record(s)`,
                    records: res.records,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        throw new Error(`Unsupported action '${action}'`);
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Record operation '${action}' failed on ${table_name_or_id}: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
