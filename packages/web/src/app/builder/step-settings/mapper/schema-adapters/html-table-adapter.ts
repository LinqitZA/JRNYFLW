import { NormalizedSchema } from '@activepieces/shared';

import { SchemaAdapter } from './adapter-type';

function extractHeaders(table: HTMLTableElement): string[] {
  const headerCells = table.querySelectorAll('thead th');
  if (headerCells.length > 0) {
    return Array.from(headerCells).map((cell) => cell.textContent?.trim() ?? '');
  }
  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  return Array.from(firstRow.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() ?? '');
}

export const htmlTableAdapter: SchemaAdapter = {
  id: 'html_table',
  parse: ({ raw }) => {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const table = doc.querySelector('table');
    if (!table) {
      throw new Error('No <table> element found in HTML input');
    }
    const headers = extractHeaders(table).filter((name) => name.length > 0);
    if (headers.length === 0) {
      throw new Error('Table has no header cells');
    }
    const schema: NormalizedSchema = {
      root: 'array',
      fields: headers.map((name) => ({ name, type: 'string' })),
    };
    return schema;
  },
};
