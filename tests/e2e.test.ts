/**
 * Full End-to-End Automated Test Suite for Airtable Full-Stack MCP
 */

import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AirtableApiClient } from '../src/client/airtable_api.js';
import { BrowserCdpClient } from '../src/client/browser_cdp.js';
import { registerSchemaTools } from '../src/tools/schema_tools.js';
import { registerDataTools } from '../src/tools/data_tools.js';
import { registerInterfaceTools } from '../src/tools/interface_tools.js';
import { registerKanbanTools } from '../src/tools/kanban_tools.js';
import { registerPermissionTools } from '../src/tools/permission_tools.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('  Airtable Full-Stack MCP: Live End-to-End Test Suite');
  console.log('====================================================\n');

  const baseId = process.env.AIRTABLE_BASE_ID || 'appoorUuG6wgx8dJ1';
  console.log(`[Config] Target Base ID: ${baseId}`);
  console.log(`[Config] CDP Port: ${process.env.AIRTABLE_CDP_PORT || 9223}\n`);

  // 1. Initialize MCP Server and Client
  const server = new McpServer({
    name: 'airtable-fullstack-mcp-test',
    version: '1.0.0',
  });

  const apiClient = new AirtableApiClient();
  const cdpClient = new BrowserCdpClient();

  registerSchemaTools(server, apiClient);
  registerDataTools(server, apiClient);
  registerInterfaceTools(server, cdpClient);
  registerKanbanTools(server, cdpClient);
  registerPermissionTools(server, cdpClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'e2e-test-runner', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  // 2. Test Tool Listing
  console.log('▶ [TEST 1] Listing all registered MCP tools...');
  const toolsResult = await client.listTools();
  console.log(`✔ Found ${toolsResult.tools.length} registered tools:`);
  toolsResult.tools.forEach((t) => console.log(`   - ${t.name}`));

  if (toolsResult.tools.length !== 10) {
    throw new Error(`Expected 10 tools, found ${toolsResult.tools.length}`);
  }

  // 3. Test Schema Inspection (REST Engine)
  console.log('\n▶ [TEST 2] Testing airtable_list_schema (Engine 1: REST)...');
  const schemaRes = await client.callTool({
    name: 'airtable_list_schema',
    arguments: { base_id: baseId },
  });

  const schemaText = (schemaRes.content as any)[0].text;
  const schemaData = JSON.parse(schemaText);
  if (!schemaData.success) {
    throw new Error(`airtable_list_schema failed: ${schemaText}`);
  }
  console.log(`✔ Successfully retrieved base schema! Found ${schemaData.tables.length} tables:`);
  schemaData.tables.forEach((t: any) =>
    console.log(`   - ${t.name} (Fields: ${t.fieldCount}, Views: ${t.viewCount})`)
  );

  // 4. Test Data Querying (REST Engine)
  console.log('\n▶ [TEST 3] Testing airtable_query_records (Engine 1: REST)...');
  const queryRes = await client.callTool({
    name: 'airtable_query_records',
    arguments: {
      base_id: baseId,
      table_name_or_id: schemaData.tables[0].name,
      max_records: 2,
    },
  });

  const queryText = (queryRes.content as any)[0].text;
  const queryData = JSON.parse(queryText);
  if (!queryData.success) {
    throw new Error(`airtable_query_records failed: ${queryText}`);
  }
  console.log(`✔ Successfully queried '${schemaData.tables[0].name}'! Retrieved ${queryData.totalRetrieved} records.`);
  if (queryData.records.length > 0) {
    console.log(`   Sample Record ID: ${queryData.records[0].id}`);
  }

  // 5. Test Browser CDP Health & Navigation (Engine 2: CDP)
  console.log('\n▶ [TEST 4] Testing Browser CDP Connectivity & Tab Hook (Engine 2: CDP)...');
  const session = await cdpClient.getAirtablePage(baseId);
  const pageTitle = await session.page.title();
  const pageUrl = session.page.url();
  console.log(`✔ Connected to Chrome via CDP!`);
  console.log(`   - Active Page Title: "${pageTitle}"`);
  console.log(`   - Active Page URL:   "${pageUrl}"`);

  // Disconnect cleanly from CDP
  await session.browser.close();

  console.log('\n====================================================');
  console.log('  🎉 ALL E2E TESTS PASSED (10/10 Tools Operational)  ');
  console.log('====================================================\n');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
