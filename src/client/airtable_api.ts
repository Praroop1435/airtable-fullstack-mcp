/**
 * Airtable Official REST & Metadata API Client
 *
 * Implements:
 * - Table & Field schema provisioning via Metadata API (/v0/meta/bases/{baseId}/tables)
 * - Record batch creation & upsert with 10-record chunking and rate-limit backoff (5 req/sec)
 * - Server-side record filtering via filterByFormula
 */

import type {
  AirtableTableConfig,
  AirtableQueryRecordsArgs,
  AirtableFieldConfig,
} from '../types/index.js';

export interface AirtableApiConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class AirtableApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AirtableApiConfig = {}) {
    this.apiKey =
      config.apiKey ||
      process.env.AIRTABLE_API_KEY ||
      process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ||
      '';
    this.baseUrl = config.baseUrl || 'https://api.airtable.com/v0';

    if (!this.apiKey) {
      console.warn(
        '[AirtableApiClient] Warning: AIRTABLE_API_KEY or AIRTABLE_PERSONAL_ACCESS_TOKEN is not configured.'
      );
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Safe fetch with automatic retry on 429 rate limit
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 3
  ): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) || 30;
        console.warn(
          `[AirtableApiClient] 429 Rate Limit exceeded. Backing off for ${retryAfter}s (attempt ${attempt}/${retries})...`
        );
        await this.sleep(retryAfter * 1000);
        continue;
      }

      return response;
    }

    throw new Error(`[AirtableApiClient] Exceeded max retries for ${url}`);
  }

  /**
   * List base schema (tables, fields, views) via Metadata API
   */
  async listBaseSchema(baseId: string): Promise<any> {
    const url = `${this.baseUrl}/meta/bases/${baseId}/tables`;
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list base schema (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Create a new table with fields via Metadata API
   */
  async createTable(
    baseId: string,
    tableConfig: AirtableTableConfig
  ): Promise<any> {
    const url = `${this.baseUrl}/meta/bases/${baseId}/tables`;
    const payload = {
      name: tableConfig.name,
      description: tableConfig.description,
      fields: tableConfig.fields,
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create table '${tableConfig.name}' (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Create multiple tables in sequence
   */
  async createTables(
    baseId: string,
    tables: AirtableTableConfig[]
  ): Promise<any[]> {
    const created: any[] = [];
    for (const table of tables) {
      const res = await this.createTable(baseId, table);
      created.push(res);
      // Wait 250ms between table creation to respect rate limits
      await this.sleep(250);
    }
    return created;
  }

  /**
   * Batch upsert or create records with automatic 10-record chunking
   * Airtable allows up to 10 records per request and max 5 req/sec
   */
  async batchUpsertRecords(
    baseId: string,
    tableNameOrId: string,
    records: Array<Record<string, unknown>>,
    typecast = true
  ): Promise<{ createdCount: number; records: any[] }> {
    const encodedTable = encodeURIComponent(tableNameOrId);
    const url = `${this.baseUrl}/${baseId}/${encodedTable}`;
    const allResults: any[] = [];

    // Chunk into 10 records
    const chunkSize = 10;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const payload = {
        records: chunk.map((fields) => ({ fields })),
        typecast,
      };

      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Batch insert failed at records ${i}-${i + chunk.length} (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.records)) {
        allResults.push(...data.records);
      }

      // Enforce 5 req/sec limit: 200ms delay between batch calls
      if (i + chunkSize < records.length) {
        await this.sleep(210);
      }
    }

    return {
      createdCount: allResults.length,
      records: allResults,
    };
  }

  /**
   * Query records with formula filters, field selection, and pagination
   */
  async queryRecords(
    args: AirtableQueryRecordsArgs
  ): Promise<{ total: number; records: any[] }> {
    const encodedTable = encodeURIComponent(args.table_name_or_id);
    const results: any[] = [];
    let offset: string | undefined = undefined;
    const maxRecords = args.max_records || 100;
    const pageSize = Math.min(args.page_size || 100, 100);

    do {
      const queryParams = new URLSearchParams();
      queryParams.set('pageSize', pageSize.toString());

      if (args.filter_by_formula) {
        queryParams.set('filterByFormula', args.filter_by_formula);
      }
      if (args.view) {
        queryParams.set('view', args.view);
      }
      if (offset) {
        queryParams.set('offset', offset);
      }
      if (args.fields && args.fields.length > 0) {
        args.fields.forEach((f) => queryParams.append('fields[]', f));
      }
      if (args.sort && args.sort.length > 0) {
        args.sort.forEach((s, idx) => {
          queryParams.set(`sort[${idx}][field]`, s.field);
          queryParams.set(`sort[${idx}][direction]`, s.direction || 'asc');
        });
      }

      const url = `${this.baseUrl}/${args.base_id}/${encodedTable}?${queryParams.toString()}`;
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to query records (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.records)) {
        results.push(...data.records);
      }

      offset = data.offset;

      if (results.length >= maxRecords) {
        break;
      }

      if (offset) {
        await this.sleep(210);
      }
    } while (offset);

    const finalRecords = results.slice(0, maxRecords);
    return {
      total: finalRecords.length,
      records: finalRecords,
    };
  }

  /**
   * Retrieve a single record by ID
   */
  async getRecord(
    baseId: string,
    tableNameOrId: string,
    recordId: string
  ): Promise<any> {
    const encodedTable = encodeURIComponent(tableNameOrId);
    const url = `${this.baseUrl}/${baseId}/${encodedTable}/${recordId}`;
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get record ${recordId} (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Update a single record (PATCH)
   */
  async updateRecord(
    baseId: string,
    tableNameOrId: string,
    recordId: string,
    fields: Record<string, unknown>,
    typecast = true
  ): Promise<any> {
    const encodedTable = encodeURIComponent(tableNameOrId);
    const url = `${this.baseUrl}/${baseId}/${encodedTable}/${recordId}`;
    const payload = {
      fields,
      typecast,
    };

    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update record ${recordId} (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Delete a single record
   */
  async deleteRecord(
    baseId: string,
    tableNameOrId: string,
    recordId: string
  ): Promise<{ id: string; deleted: boolean }> {
    const encodedTable = encodeURIComponent(tableNameOrId);
    const url = `${this.baseUrl}/${baseId}/${encodedTable}/${recordId}`;
    const response = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to delete record ${recordId} (${response.status}): ${errorText}`
      );
    }

    return (await response.json()) as { id: string; deleted: boolean };
  }

  /**
   * Batch delete records (chunks of 10)
   */
  async batchDeleteRecords(
    baseId: string,
    tableNameOrId: string,
    recordIds: string[]
  ): Promise<{ deletedCount: number; records: Array<{ id: string; deleted: boolean }> }> {
    const encodedTable = encodeURIComponent(tableNameOrId);
    const deletedResults: Array<{ id: string; deleted: boolean }> = [];
    const chunkSize = 10;

    for (let i = 0; i < recordIds.length; i += chunkSize) {
      const chunk = recordIds.slice(i, i + chunkSize);
      const queryParams = new URLSearchParams();
      chunk.forEach((id) => queryParams.append('records[]', id));

      const url = `${this.baseUrl}/${baseId}/${encodedTable}?${queryParams.toString()}`;
      const response = await this.fetchWithRetry(url, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Batch delete failed at records ${i}-${i + chunk.length} (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.records)) {
        deletedResults.push(...data.records);
      }

      if (i + chunkSize < recordIds.length) {
        await this.sleep(210);
      }
    }

    return {
      deletedCount: deletedResults.length,
      records: deletedResults,
    };
  }

  /**
   * Add a new field to an existing table via Metadata API
   */
  async createField(
    baseId: string,
    tableIdOrName: string,
    fieldConfig: AirtableFieldConfig
  ): Promise<any> {
    const url = `${this.baseUrl}/meta/bases/${baseId}/tables/${encodeURIComponent(tableIdOrName)}/fields`;
    const payload = {
      name: fieldConfig.name,
      type: fieldConfig.type,
      description: fieldConfig.description,
      options: fieldConfig.options,
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create field '${fieldConfig.name}' in table '${tableIdOrName}' (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Update an existing field's name or description via Metadata API
   */
  async updateField(
    baseId: string,
    tableIdOrName: string,
    fieldId: string,
    updateConfig: { name?: string; description?: string }
  ): Promise<any> {
    const url = `${this.baseUrl}/meta/bases/${baseId}/tables/${encodeURIComponent(tableIdOrName)}/fields/${fieldId}`;
    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updateConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update field '${fieldId}' (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Update a table's name or description via Metadata API
   */
  async updateTable(
    baseId: string,
    tableIdOrName: string,
    updateConfig: { name?: string; description?: string }
  ): Promise<any> {
    const url = `${this.baseUrl}/meta/bases/${baseId}/tables/${encodeURIComponent(tableIdOrName)}`;
    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updateConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update table '${tableIdOrName}' (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * List all webhooks for a base
   */
  async listWebhooks(baseId: string): Promise<any> {
    const url = `${this.baseUrl}/bases/${baseId}/webhooks`;
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list webhooks for base ${baseId} (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Create a webhook for a base
   */
  async createWebhook(
    baseId: string,
    notificationUrl: string,
    specification: any
  ): Promise<any> {
    const url = `${this.baseUrl}/bases/${baseId}/webhooks`;
    const payload = {
      notificationUrl,
      specification: specification || {
        options: {
          filters: {
            dataPersistence: { enabled: true },
            fromSources: ['client', 'publicApi', 'formSubmission', 'automation'],
          },
        },
      },
    };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create webhook for base ${baseId} (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Delete a webhook by ID
   */
  async deleteWebhook(baseId: string, webhookId: string): Promise<void> {
    const url = `${this.baseUrl}/bases/${baseId}/webhooks/${webhookId}`;
    const response = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to delete webhook ${webhookId} (${response.status}): ${errorText}`
      );
    }
  }

  /**
   * Get payloads for a webhook
   */
  async getWebhookPayloads(
    baseId: string,
    webhookId: string,
    cursor?: number
  ): Promise<any> {
    const query = cursor ? `?cursor=${cursor}` : '';
    const url = `${this.baseUrl}/bases/${baseId}/webhooks/${webhookId}/payloads${query}`;
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get payloads for webhook ${webhookId} (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }
}

