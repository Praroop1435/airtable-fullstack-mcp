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
