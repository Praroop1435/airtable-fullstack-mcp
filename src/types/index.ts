/**
 * Full-Stack Airtable MCP - Core Type Definitions
 */

export type AirtableFieldType =
  | 'singleLineText'
  | 'multilineText'
  | 'richText'
  | 'number'
  | 'currency'
  | 'percent'
  | 'singleSelect'
  | 'multipleSelects'
  | 'date'
  | 'dateTime'
  | 'phoneNumber'
  | 'email'
  | 'url'
  | 'checkbox'
  | 'multipleRecordLinks'
  | 'formula'
  | 'rollup'
  | 'lookup'
  | 'multipleAttachments'
  | 'rating'
  | 'duration'
  | 'createdTime'
  | 'lastModifiedTime'
  | 'autoNumber'
  | 'barcode'
  | 'button';

export interface SelectOptionChoice {
  name: string;
  color?: string;
  id?: string;
}

export interface AirtableFieldOptions {
  choices?: SelectOptionChoice[];
  precision?: number;
  symbol?: string;
  format?: string;
  dateFormat?: { name: string; format?: string };
  timeFormat?: { name: string; format?: string };
  icon?: string;
  color?: string;
  linkedTableId?: string;
  prefersSingleRecordLink?: boolean;
  inverseLinkFieldId?: string;
  formula?: string;
  recordLinkFieldId?: string;
  fieldIdMergeStrategy?: string;
  [key: string]: unknown;
}

export interface AirtableFieldConfig {
  name: string;
  type: AirtableFieldType;
  description?: string;
  options?: AirtableFieldOptions;
}

export interface AirtableTableConfig {
  name: string;
  description?: string;
  fields: AirtableFieldConfig[];
}

export interface AirtableCreateSchemaArgs {
  base_id: string;
  tables: AirtableTableConfig[];
}

export interface AirtableBatchUpsertArgs {
  base_id: string;
  table_name_or_id: string;
  records: Array<Record<string, unknown>>;
  typecast?: boolean;
}

export interface AirtableQueryRecordsArgs {
  base_id: string;
  table_name_or_id: string;
  filter_by_formula?: string;
  fields?: string[];
  max_records?: number;
  page_size?: number;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  view?: string;
}

export type InterfaceLayoutType =
  | 'dashboard'
  | 'kanban'
  | 'grid'
  | 'record_review';

export interface InterfaceCreatePageArgs {
  base_id: string;
  page_name: string;
  layout_type: InterfaceLayoutType;
  table_name: string;
  cdp_port?: number;
}

export interface InterfaceConfigureKanbanArgs {
  base_id: string;
  page_id?: string;
  stack_by_field: string;
  card_fields?: string[];
  cdp_port?: number;
}

export interface InterfaceSetFieldPermissionsArgs {
  base_id: string;
  page_id?: string;
  locked_columns?: string[];
  editable_columns?: string[];
  cdp_port?: number;
}

export interface InterfaceConfigureDetailSheetArgs {
  base_id: string;
  page_id?: string;
  title_field?: string;
  locked_fields?: string[];
  editable_fields?: string[];
  cdp_port?: number;
}

export interface InterfacePublishArgs {
  base_id: string;
  page_id?: string;
  cdp_port?: number;
}

export interface InterfaceRebrandArgs {
  base_id: string;
  page_id?: string;
  title?: string;
  sidebar_bundle_name?: string;
  cdp_port?: number;
}

export type AirtableRecordAction =
  | 'get'
  | 'update'
  | 'delete'
  | 'batch_delete';

export interface AirtableManageRecordsArgs {
  base_id: string;
  table_name_or_id: string;
  action: AirtableRecordAction;
  record_id?: string;
  record_ids?: string[];
  fields?: Record<string, unknown>;
  typecast?: boolean;
}

export type AirtableSchemaAction =
  | 'create_field'
  | 'update_field'
  | 'update_table';

export interface AirtableModifySchemaArgs {
  base_id: string;
  table_id_or_name: string;
  action: AirtableSchemaAction;
  field_config?: AirtableFieldConfig;
  field_id?: string;
  field_update?: {
    name?: string;
    description?: string;
  };
  table_update?: {
    name?: string;
    description?: string;
  };
}

export type AirtableWebhookAction =
  | 'create'
  | 'list'
  | 'delete'
  | 'payloads';

export interface AirtableWebhookSpecification {
  options: {
    filters: {
      dataPersistence?: {
        enabled: boolean;
      };
      fromSources?: string[];
      source?: 'client' | 'publicApi' | 'formSubmission' | 'automation' | 'sync';
      watchDataInTables?: string[];
    };
    includes?: {
      includeCellValuesInFieldIds?: 'all' | string[];
      includePreviousCellValues?: boolean;
      includePreviousFieldDefinitions?: boolean;
    };
  };
}

export interface AirtableManageWebhookArgs {
  base_id: string;
  action: AirtableWebhookAction;
  notification_url?: string;
  specification?: AirtableWebhookSpecification;
  webhook_id?: string;
  cursor?: number;
}

export type AutomationScriptTemplate =
  | 'tally_fillout_mapper'
  | 'stripe_paypal_reconciliation'
  | 'unique_id_generator'
  | 'deduplication_sync'
  | 'custom';

export interface AirtableAutomationScriptArgs {
  template: AutomationScriptTemplate;
  table_name: string;
  field_mappings?: Record<string, string>;
  options?: {
    id_prefix?: string;
    unique_field?: string;
    amount_field?: string;
    status_field?: string;
    custom_logic?: string;
  };
}

