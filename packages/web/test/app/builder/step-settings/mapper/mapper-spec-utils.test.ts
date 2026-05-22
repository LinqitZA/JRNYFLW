// @vitest-environment jsdom
import { MappingSpec } from '@activepieces/shared';

import { mapperSpecUtils } from '@/app/builder/step-settings/mapper/mapper-spec-utils';

const { createEmptySpec, setBinding, removeBinding } = mapperSpecUtils;

describe('mapperSpecUtils create/set/remove binding', () => {
  test('createEmptySpec returns an auto-mode spec with no fields', () => {
    expect(createEmptySpec()).toEqual({ specVersion: 1, mode: 'auto', fields: [] });
  });

  test('setBinding adds a header binding for a scalar slot', () => {
    const spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'CustomerPONumber' });
    expect(spec.fields).toEqual([
      { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
    ]);
  });

  test('setBinding upserts (replaces) an existing target binding', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'A' });
    spec = setBinding(spec, { targetPath: 'po_number', sourcePath: 'B' });
    expect(spec.fields).toEqual([
      { target: 'po_number', binding: { kind: 'header', source: 'B' } },
    ]);
  });

  test('setBinding into a collection creates the line_collection and a row item', () => {
    const spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    expect(spec.fields).toEqual([
      {
        target: 'lines',
        binding: { kind: 'line_collection', items: [{ target: 'product_code', binding: { kind: 'row', source: 'SKU' } }] },
      },
    ]);
  });

  test('setBinding adds a second item to an existing line_collection', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    spec = setBinding(spec, { targetPath: 'quantity', sourcePath: 'Qty', collectionPath: 'lines' });
    const lines = spec.fields.find((f) => f.target === 'lines');
    expect(lines?.binding).toEqual({
      kind: 'line_collection',
      items: [
        { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
        { target: 'quantity', binding: { kind: 'row', source: 'Qty' } },
      ],
    });
  });

  test('removeBinding deletes a top-level field', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'A' });
    spec = removeBinding(spec, { targetPath: 'po_number' });
    expect(spec.fields).toEqual([]);
  });

  test('removeBinding deletes a collection item and prunes the empty collection', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    spec = removeBinding(spec, { targetPath: 'product_code', collectionPath: 'lines' });
    expect(spec.fields).toEqual([]);
  });
});
