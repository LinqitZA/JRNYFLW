import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { SchemaAdapter } from './adapter-type';
import { inferSchemaUtils } from './infer-schema';

export const xmlAdapter: SchemaAdapter = {
  id: 'xml',
  parse: ({ raw }) => {
    const validation = XMLValidator.validate(raw);
    if (validation !== true) {
      throw new Error('Invalid XML input');
    }
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
    });
    const parsed = parser.parse(raw);
    const rootKeys = Object.keys(parsed);
    const inner = rootKeys.length === 1 ? parsed[rootKeys[0]] : parsed;
    return inferSchemaUtils.inferSchemaFromSample(inner);
  },
};
