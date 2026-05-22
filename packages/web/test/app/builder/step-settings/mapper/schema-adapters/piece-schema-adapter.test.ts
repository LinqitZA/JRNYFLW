// @vitest-environment jsdom
import { pieceSchemaUtils } from '@/app/builder/step-settings/mapper/schema-adapters/piece-schema-adapter';

const { fromPropertyMap } = pieceSchemaUtils;

describe('pieceSchemaUtils.fromPropertyMap', () => {
  test('maps scalar property types to NormalizedSchema fields', () => {
    const props = {
      customerCode: { type: 'SHORT_TEXT' },
      qty: { type: 'NUMBER' },
      autoConvert: { type: 'CHECKBOX' },
    };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'customerCode', type: 'string' },
        { name: 'qty', type: 'number' },
        { name: 'autoConvert', type: 'boolean' },
      ],
    });
  });

  test('maps an ARRAY property with nested properties to an array field with children', () => {
    const props = {
      lines: {
        type: 'ARRAY',
        properties: { stockCode: { type: 'SHORT_TEXT' }, qty: { type: 'NUMBER' } },
      },
    };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'lines', type: 'array', children: [{ name: 'stockCode', type: 'string' }, { name: 'qty', type: 'number' }] },
      ],
    });
  });

  test('maps JSON/OBJECT to object and unknown types to unknown', () => {
    const props = { payload: { type: 'JSON' }, weird: { type: 'WHATEVER' } };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'payload', type: 'object' },
        { name: 'weird', type: 'unknown' },
      ],
    });
  });
});
