// @vitest-environment jsdom
import { NormalizedSchema } from '@activepieces/shared';

import { mapperTargetUtils } from '@/app/builder/step-settings/mapper/target-slot-utils';

const { deriveSlots } = mapperTargetUtils;

describe('deriveSlots', () => {
  test('flattens scalar and nested-object fields into scalar slots', () => {
    const schema: NormalizedSchema = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        { name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] },
      ],
    };
    expect(deriveSlots(schema)).toEqual([
      { path: 'po_number', name: 'po_number', type: 'string', kind: 'scalar', depth: 0 },
      { path: 'customer', name: 'customer', type: 'object', kind: 'scalar', depth: 0 },
      { path: 'customer.name', name: 'name', type: 'string', kind: 'scalar', depth: 1 },
    ]);
  });

  test('emits a collection slot plus item slots for array-of-objects fields', () => {
    const schema: NormalizedSchema = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        {
          name: 'lines',
          type: 'array',
          children: [
            { name: 'product_code', type: 'string' },
            { name: 'quantity', type: 'number' },
          ],
        },
      ],
    };
    expect(deriveSlots(schema)).toEqual([
      { path: 'po_number', name: 'po_number', type: 'string', kind: 'scalar', depth: 0 },
      { path: 'lines', name: 'lines', type: 'array', kind: 'collection', depth: 0 },
      { path: 'product_code', name: 'product_code', type: 'string', kind: 'scalar', collectionPath: 'lines', depth: 1 },
      { path: 'quantity', name: 'quantity', type: 'number', kind: 'scalar', collectionPath: 'lines', depth: 1 },
    ]);
  });

  test('array-of-scalars field is a plain scalar slot (no item slots)', () => {
    const schema: NormalizedSchema = { root: 'object', fields: [{ name: 'tags', type: 'array' }] };
    expect(deriveSlots(schema)).toEqual([
      { path: 'tags', name: 'tags', type: 'array', kind: 'scalar', depth: 0 },
    ]);
  });
});
