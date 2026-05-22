import { NormalizedSchema } from '@activepieces/shared';

export type SchemaAdapterId =
  | 'json_sample'
  | 'json_schema'
  | 'csv'
  | 'xml'
  | 'html_table'
  | 'openapi'
  | 'piece_schema';

export type SchemaAdapterInput = {
  raw: string;
  ref?: string;
};

export type SchemaAdapter = {
  id: SchemaAdapterId;
  parse: (input: SchemaAdapterInput) => NormalizedSchema;
};
