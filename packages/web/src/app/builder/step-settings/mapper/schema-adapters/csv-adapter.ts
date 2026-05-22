import Papa from 'papaparse';

import { SchemaAdapter } from './adapter-type';
import { inferSchemaUtils } from './infer-schema';

export const csvAdapter: SchemaAdapter = {
  id: 'csv',
  parse: ({ raw }) => {
    if (raw.trim() === '') {
      throw new Error('CSV input is empty');
    }
    const result = Papa.parse<Record<string, unknown>>(raw, {
      header: true,
      skipEmptyLines: true,
    });
    if (result.data.length === 0) {
      throw new Error('CSV has no data rows');
    }
    return inferSchemaUtils.inferSchemaFromSample(result.data);
  },
};
