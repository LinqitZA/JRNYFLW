import { SchemaAdapter } from './adapter-type';
import { inferSchemaUtils } from './infer-schema';

export const jsonSampleAdapter: SchemaAdapter = {
  id: 'json_sample',
  parse: ({ raw }) => {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON sample');
    }
    return inferSchemaUtils.inferSchemaFromSample(value);
  },
};
