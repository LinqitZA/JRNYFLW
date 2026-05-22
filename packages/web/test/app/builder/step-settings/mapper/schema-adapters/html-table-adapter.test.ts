// @vitest-environment jsdom
import { htmlTableAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/html-table-adapter';

describe('htmlTableAdapter', () => {
  test('has id html_table', () => {
    expect(htmlTableAdapter.id).toBe('html_table');
  });

  test('parses thead headers into an array schema of string fields', () => {
    const raw =
      '<table><thead><tr><th>SKU</th><th>Qty</th></tr></thead><tbody><tr><td>A</td><td>2</td></tr></tbody></table>';
    expect(htmlTableAdapter.parse({ raw })).toEqual({
      root: 'array',
      fields: [
        { name: 'SKU', type: 'string' },
        { name: 'Qty', type: 'string' },
      ],
    });
  });

  test('falls back to first row cells when there is no thead', () => {
    const raw =
      '<table><tr><th>Name</th><th>Email</th></tr><tr><td>Acme</td><td>a@b.c</td></tr></table>';
    expect(htmlTableAdapter.parse({ raw })).toEqual({
      root: 'array',
      fields: [
        { name: 'Name', type: 'string' },
        { name: 'Email', type: 'string' },
      ],
    });
  });

  test('throws when no table is present', () => {
    expect(() => htmlTableAdapter.parse({ raw: '<div>no table</div>' })).toThrow(/table/i);
  });
});
