import { FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { shapeFields } from './shape'

const shape = (fields: FieldMapping[], scope: { current: unknown; rows: unknown[] }) => {
    const warnings: MapperWarning[] = []
    const output = shapeFields({ fields, scope, basePath: '', warnings })
    return { output, warnings }
}

describe('shapeFields', () => {
    test('writes scalar header bindings to nested target paths', () => {
        const { output } = shape(
            [{ target: 'customer.name', binding: { kind: 'header', source: 'CustomerName' } }],
            { current: { CustomerName: 'Acme' }, rows: [{ CustomerName: 'Acme' }] },
        )
        expect(output).toEqual({ customer: { name: 'Acme' } })
    })

    test('applies transforms in a binding', () => {
        const { output } = shape(
            [{ target: 'qty', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } }],
            { current: { Qty: '7' }, rows: [{ Qty: '7' }] },
        )
        expect(output).toEqual({ qty: 7 })
    })

    test('missing source yields null and a warning', () => {
        const { output, warnings } = shape(
            [{ target: 'x', binding: { kind: 'header', source: 'Nope' } }],
            { current: { a: 1 }, rows: [{ a: 1 }] },
        )
        expect(output).toEqual({ x: null })
        expect(warnings[0]).toMatchObject({ path: 'x', code: 'missing_source' })
    })

    test('line_collection over scope.rows builds an array of shaped items', () => {
        const fields: FieldMapping[] = [
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
        ]
        const rows = [{ SKU: 'A1', Qty: '2' }, { SKU: 'B2', Qty: '3' }]
        const { output } = shape(fields, { current: rows[0], rows })
        expect(output).toEqual({ lines: [{ product_code: 'A1', quantity: 2 }, { product_code: 'B2', quantity: 3 }] })
    })

    test('line_collection with explicit source iterates a nested array', () => {
        const fields: FieldMapping[] = [
            {
                target: 'items',
                binding: {
                    kind: 'line_collection',
                    source: 'cart.products',
                    items: [{ target: 'code', binding: { kind: 'row', source: 'id' } }],
                },
            },
        ]
        const obj = { cart: { products: [{ id: 'p1' }, { id: 'p2' }] } }
        const { output } = shape(fields, { current: obj, rows: [obj] })
        expect(output).toEqual({ items: [{ code: 'p1' }, { code: 'p2' }] })
    })

    test('line_collection over a non-array source yields [] and a warning', () => {
        const fields: FieldMapping[] = [
            { target: 'items', binding: { kind: 'line_collection', source: 'missing', items: [] } },
        ]
        const { output, warnings } = shape(fields, { current: {}, rows: [{}] })
        expect(output).toEqual({ items: [] })
        expect(warnings[0]).toMatchObject({ path: 'items', code: 'not_an_array' })
    })
})
