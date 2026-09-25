---
name: airtable-builder
description: >
  Full-stack Airtable operations, automations, and interface design assistant. Uses the airtable-fullstack-mcp
  dual-engine server to provision schemas & data via REST/Metadata APIs, manage real-time webhooks, generate
  in-base automation scripts, and build live dashboards, kanbans, field-permission locks, and published interfaces via Chrome CDP automation.
---

# Airtable Full-Stack Builder & Architect Skill

## 1. Overview & Dual-Engine Architecture

Airtable consists of two distinct operational layers:
1. **Data & Schema Layer (Official REST & Metadata API)**:
   - Programmatically provisions bases, tables, custom fields, and views.
   - Batch ingests records in 10-record chunks with 5 req/sec rate limit handling.
   - Filters records server-side with `filterByFormula`.
2. **Interface Designer Layer (Chrome CDP Browser Automation)**:
   - Since Airtable has **no public API** for Interface Designer, this engine connects directly to the user's running Chrome session via Chrome DevTools Protocol (CDP).
   - Creates interface pages: Executive Dashboards, Gated Review Queues, Kanban Pipelines, and Master Directories.
   - Enforces column inline edit locks (`Edit this column inline = OFF`) to prevent data corruption.
   - Configures opening side-sheet detail cards and field editability switches.
   - Publishes draft interface changes deterministically.

---

## 2. Standard Interface Archetypes

When prompted to build an Airtable application or business operations system, configure these 4 core interface archetypes:

### Pattern A: Executive Telemetry Dashboard
* **Purpose**: High-level KPI visibility for management and executives.
* **Access Level**: 100% Read-Only.
* **Components**:
  * KPI summary metric counters (e.g. *Active Leads*, *Conversion Velocity*, *ARR*).
  * Funnel/Stage Bar Charts (e.g. *Outreach Progression*).
  * Status Pivot Tables.

### Pattern B: Gated Review Queue (Intake & Screening)
* **Purpose**: Lead evaluation, document review, and approval gating.
* **Layout**: Full-width interactive grid table with expandable side-sheet.
* **Field Security Matrix**:
  * **Locked Columns (`Edit this column inline = OFF`)**: Permanent IDs, applicant name, raw ingest fields, timestamps.
  * **Editable Columns (`Edit this column inline = ON`)**: Decision gate status dropdowns, evaluation notes.

### Pattern C: Visual Kanban Progression Pipeline
* **Purpose**: Multi-stage operations tracking (e.g. Onboarding, Fulfillment, Deal Pipeline).
* **Layout**: Kanban board stacked by single-select stage field (`Lead` → `Screening` → `Payment` → `Onboarding` → `Live`).
* **Front-of-Card Badges**: Primary Entity Name, Stage Badge, Value/Plan, Unique ID.
* **Side-Sheet Record Details**: 4 structured blocks (Entity Info, Milestones, Commercial Audit, Logistics).

### Pattern D: Master Census Directory
* **Purpose**: Single source of truth database.
* **Layout**: High-density searchable/filterable grid.
* **Field Security Matrix**: All system data locked; compliance/opt-out switches editable.

---

## 3. Tool Usage Playbook

### Step 1: Provision Schema & Tables
Use `airtable_create_base_schema` with the target `base_id` and table array:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "tables": [
    {
      "name": "Merchants Master",
      "fields": [
        { "name": "Merchant ID", "type": "singleLineText" },
        { "name": "Store Name", "type": "singleLineText" },
        { "name": "City", "type": "singleLineText" },
        { "name": "Stage", "type": "singleSelect", "options": { "choices": [{ "name": "Lead" }, { "name": "Contract" }, { "name": "Active" }] } },
        { "name": "Monthly ARR", "type": "currency", "options": { "precision": 2, "symbol": "$" } }
      ]
    }
  ]
}
```

### Step 2: Ingest Seed / Operational Data
Use `airtable_batch_upsert`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "table_name_or_id": "Merchants Master",
  "records": [
    { "Merchant ID": "M-001", "Store Name": "Downtown Retail", "City": "Toronto", "Stage": "Lead", "Monthly ARR": 1200 },
    { "Merchant ID": "M-002", "Store Name": "Metro Express", "City": "Vancouver", "Stage": "Contract", "Monthly ARR": 2400 }
  ]
}
```

### Step 3: Create & Brand Interface Pages
1. Ensure Chrome is running with `--remote-debugging-port=9223`.
2. Create page with `airtable_create_interface_page`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "page_name": "Merchant Onboarding Kanban",
  "layout_type": "kanban",
  "table_name": "Merchants Master"
}
```
3. Rebrand interface and sidebar with `airtable_rebrand_interface`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "title": "Merchant Operations Hub",
  "sidebar_bundle_name": "📁 Onboarding & CRM"
}
```

### Step 4: Configure Stacking & Field Locks
1. Stack Kanban by stage with `airtable_configure_kanban`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "stack_by_field": "Stage",
  "card_fields": ["Store Name", "Monthly ARR", "Merchant ID"]
}
```
2. Lock critical columns with `airtable_set_field_permissions`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "locked_columns": ["Merchant ID", "Monthly ARR"],
  "editable_columns": ["Stage"]
}
```

### Step 5: Publish Interface
Finalize all changes with `airtable_publish_interface`:
```json
{
  "base_id": "appXXXXXXXXXXXXXX"
}
```

### Step 6: Connect Real-Time External Webhooks
Use `airtable_manage_webhook` to register webhooks for external tools (Tally, Stripe, Make, Zapier):
```json
{
  "base_id": "appXXXXXXXXXXXXXX",
  "action": "create",
  "notification_url": "https://api.yourdomain.com/webhooks/airtable"
}
```

### Step 7: Generate In-Base Automation Scripts
Generate verified JavaScript for Airtable's "Run a script" action with `airtable_generate_automation_script`:
```json
{
  "template": "stripe_paypal_reconciliation",
  "table_name": "Merchants Master",
  "options": {
    "unique_field": "Contact Email",
    "amount_field": "Monthly ARR",
    "status_field": "Stage"
  }
}
```

---

## 4. Claude Desktop & Agent Configuration

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "airtable-fullstack": {
      "command": "npx",
      "args": ["-y", "airtable-fullstack-mcp"],
      "env": {
        "AIRTABLE_API_KEY": "pat...",
        "AIRTABLE_CDP_PORT": "9223"
      }
    }
  }
}
```
