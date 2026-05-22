import { NormalizedSchema } from '@activepieces/shared';

import {
  SchemaAdapter,
  SchemaAdapterId,
  SchemaAdapterInput,
} from './adapter-type';
import { csvAdapter } from './csv-adapter';
import { htmlTableAdapter } from './html-table-adapter';
import { jsonSampleAdapter } from './json-sample-adapter';
import { jsonSchemaAdapter } from './json-schema-adapter';
import { openapiAdapter } from './openapi-adapter';
import { xmlAdapter } from './xml-adapter';

type RunSchemaAdapterParams = SchemaAdapterInput & {
  id: SchemaAdapterId;
};

function runSchemaAdapter({
  id,
  raw,
  ref,
}: RunSchemaAdapterParams): NormalizedSchema {
  const adapter = schemaAdapters[id];
  if (!adapter) {
    throw new Error(`Unknown schema adapter: ${id}`);
  }
  return adapter.parse({ raw, ref });
}

export const schemaAdapters: Record<SchemaAdapterId, SchemaAdapter> = {
  json_sample: jsonSampleAdapter,
  json_schema: jsonSchemaAdapter,
  csv: csvAdapter,
  xml: xmlAdapter,
  html_table: htmlTableAdapter,
  openapi: openapiAdapter,
};

export const schemaAdapterRunner = { runSchemaAdapter };
export { runSchemaAdapter };
export type {
  SchemaAdapter,
  SchemaAdapterId,
  SchemaAdapterInput,
} from './adapter-type';
