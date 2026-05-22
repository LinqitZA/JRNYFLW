import { MappingSpecSchema } from './mapping-spec'

describe('MappingSpecSchema', () => {
    test('parses a grouped spec with a line_collection', () => {
        const spec = {
            specVersion: 1,
            mode: 'auto',
            groupBy: ['CustomerPONumber'],
            fields: [
                { target: 'customer.po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
                {
                    target: 'lines',
                    binding: {
                        kind: 'line_collection',
                        items: [
                            { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
                            { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
                        ],
                    },
                },
            ],
        }
        expect(MappingSpecSchema.parse(spec)).toMatchObject({ specVersion: 1, mode: 'auto' })
    })

    test('defaults mode to auto when omitted', () => {
        const parsed = MappingSpecSchema.parse({ specVersion: 1, fields: [] })
        expect(parsed.mode).toBe('auto')
    })

    test('rejects an unknown binding kind', () => {
        const spec = { specVersion: 1, fields: [{ target: 'x', binding: { kind: 'wat', source: 'a' } }] }
        expect(() => MappingSpecSchema.parse(spec)).toThrow()
    })
})
