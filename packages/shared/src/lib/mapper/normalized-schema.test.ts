import { NormalizedSchemaSchema } from './normalized-schema'

describe('NormalizedSchemaSchema', () => {
  test('parses a nested object schema', () => {
    const input = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        {
          name: 'lines',
          type: 'array',
          children: [{ name: 'sku', type: 'string' }],
        },
      ],
    }
    expect(NormalizedSchemaSchema.parse(input)).toEqual(input)
  })

  test('rejects an unknown field type', () => {
    const input = { root: 'object', fields: [{ name: 'x', type: 'date' }] }
    expect(() => NormalizedSchemaSchema.parse(input)).toThrow()
  })
})
