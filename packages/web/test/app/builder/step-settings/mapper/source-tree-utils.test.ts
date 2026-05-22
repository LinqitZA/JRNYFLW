// @vitest-environment jsdom
import { mapperSourceUtils } from '@/app/builder/step-settings/mapper/source-tree-utils';

const { buildSourceTree } = mapperSourceUtils;

describe('buildSourceTree', () => {
  test('builds row fields from an array sample (first element)', () => {
    expect(buildSourceTree([{ CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' }])).toEqual([
      { path: 'CustomerPONumber', name: 'CustomerPONumber', type: 'string' },
      { path: 'SKU', name: 'SKU', type: 'string' },
      { path: 'Qty', name: 'Qty', type: 'string' },
    ]);
  });

  test('builds fields from an object sample, recursing nested objects with dotted paths', () => {
    expect(buildSourceTree({ customer: { name: 'Acme' }, total: 100 })).toEqual([
      {
        path: 'customer',
        name: 'customer',
        type: 'object',
        children: [{ path: 'customer.name', name: 'name', type: 'string' }],
      },
      { path: 'total', name: 'total', type: 'number' },
    ]);
  });

  test('treats array-valued fields as leaf array nodes (no recursion in V1)', () => {
    expect(buildSourceTree({ lines: [{ sku: 'A' }] })).toEqual([
      { path: 'lines', name: 'lines', type: 'array' },
    ]);
  });

  test('returns [] for a null or scalar sample', () => {
    expect(buildSourceTree(null)).toEqual([]);
    expect(buildSourceTree('hi')).toEqual([]);
    expect(buildSourceTree([])).toEqual([]);
  });
});
