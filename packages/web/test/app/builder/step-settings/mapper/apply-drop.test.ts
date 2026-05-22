// @vitest-environment jsdom
import { mapperDropUtils } from '@/app/builder/step-settings/mapper/target-slot-list';

const { applyDrop } = mapperDropUtils;

describe('applyDrop', () => {
  test('binds a source path to a scalar slot as a header binding', () => {
    const spec = { specVersion: 1 as const, mode: 'auto' as const, fields: [] };
    const slot = { path: 'po_number', name: 'po_number', type: 'string' as const, kind: 'scalar' as const, depth: 0 };
    const next = applyDrop({ spec, slot, sourcePath: 'CustomerPONumber' });
    expect(next.fields).toEqual([{ target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } }]);
  });

  test('binds into a collection item slot as a row binding', () => {
    const spec = { specVersion: 1 as const, mode: 'auto' as const, fields: [] };
    const slot = { path: 'product_code', name: 'product_code', type: 'string' as const, kind: 'scalar' as const, collectionPath: 'lines', depth: 1 };
    const next = applyDrop({ spec, slot, sourcePath: 'SKU' });
    expect(next.fields).toEqual([
      { target: 'lines', binding: { kind: 'line_collection', items: [{ target: 'product_code', binding: { kind: 'row', source: 'SKU' } }] } },
    ]);
  });
});
