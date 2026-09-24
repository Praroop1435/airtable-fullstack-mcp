/**
 * MCP Tools: Data Ingestion & Querying
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirtableApiClient } from '../client/airtable_api.js';

export function registerDataTools(
  server: McpServer,
  apiClient: AirtableApiClient
) {
  // Tool 3: airtable_batch_upsert
  server.tool(
    'airtable_batch_upsert',
    'Ingests or upserts records into an Airtable table. Automatically splits data into 10-record chunks and enforces the 5 req/sec rate limit with backoff.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      table_name_or_id: z.string().describe('Target Table Name or Table ID'),
      records: z
        .array(z.record(z.unknown()))
        .describe('Array of record objects mapping field names to field values'),
      typecast: z
        .boolean()
        .optional()
        .default(true)
        .describe('Enable typecasting to automatically parse string choices/links (default true)'),
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

  // Tool 4: airtable_query_records
  server.tool(
    'airtable_query_records',
    'Queries records from an Airtable table with optional server-side filterByFormula, field selection, sorting, and pagination.',
    {
      base_id: z.string().describe('Airtable Base ID (starts with app...)'),
      table_name_or_id: z.string().describe('Target Table Name or Table ID'),
      filter_by_formula: z
        .string()
        .optional()
        .describe("Airtable formula to filter records server-side (e.g. AND({Status} = 'Active', {Stage} = 'Live'))"),
      fields: z
        .array(z.string())
        .optional()
        .describe('Specific field names to return (saves bandwidth)'),
      max_records: z
        .number()
        .optional()
        .describe('Maximum number of records to retrieve (default 100)'),
      sort: z
        .array(
          z.object({
            field: z.string().describe('Field name to sort by'),
            direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
          })
        )
        .optional()
        .describe('Sort criteria: [{ field: string, direction?: "asc" | "desc" }]'),
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
}
