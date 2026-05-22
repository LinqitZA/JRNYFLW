import { MappingSpec } from '../mapping-spec'
import { mapperEngine } from './index'

describe('mapperEngine.runMapping', () => {
    test('reshape: single object → single shaped object', () => {
        const spec: MappingSpec = {
            specVersion: 1, mode: 'auto',
            fields: [{ target: 'name', binding: { kind: 'header', source: 'CustomerName', transforms: [{ id: 'trim' }] } }],
        }
        const { output, warnings } = mapperEngine.runMapping({ sourceData: { CustomerName: ' Acme ' }, spec })
        expect(output).toEqual({ name: 'Acme' })
        expect(warnings).toEqual([])
    })

    test('per_row: array without groupBy → array of shaped objects', () => {
        const spec: MappingSpec = {
            specVersion: 1, mode: 'auto',
            fields: [{ target: 'code', binding: { kind: 'row', source: 'SKU' } }],
        }
        const { output } = mapperEngine.runMapping({ sourceData: [{ SKU: 'A' }, { SKU: 'B' }], spec })
        expect(output).toEqual([{ code: 'A' }, { code: 'B' }])
    })

    test('grouped: Excel rows batched into quotations by CustomerPONumber', () => {
        const spec: MappingSpec = {
            specVersion: 1, mode: 'auto', groupBy: ['CustomerPONumber'],
            fields: [
                { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
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
        const sourceData = [
            { CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' },
            { CustomerPONumber: 'PO-1', SKU: 'B', Qty: '3' },
            { CustomerPONumber: 'PO-2', SKU: 'C', Qty: '1' },
        ]
        const { output } = mapperEngine.runMapping({ sourceData, spec })
        expect(output).toEqual([
            { po_number: 'PO-1', lines: [{ product_code: 'A', quantity: 2 }, { product_code: 'B', quantity: 3 }] },
            { po_number: 'PO-2', lines: [{ product_code: 'C', quantity: 1 }] },
        ])
    })

    test('grouped: empty source array yields []', () => {
        const spec: MappingSpec = { specVersion: 1, mode: 'auto', groupBy: ['x'], fields: [] }
        expect(mapperEngine.runMapping({ sourceData: [], spec }).output).toEqual([])
    })

    test('grouped: diverging header value within a group emits a header_mismatch warning', () => {
        const spec: MappingSpec = {
            specVersion: 1, mode: 'auto', groupBy: ['PO'],
            fields: [
                { target: 'po', binding: { kind: 'header', source: 'PO' } },
                { target: 'customer', binding: { kind: 'header', source: 'CustomerName' } },
            ],
        }
        const sourceData = [
            { PO: 'PO-1', CustomerName: 'Acme' },
            { PO: 'PO-1', CustomerName: 'Acme Corp' },
        ]
        const { output, warnings } = mapperEngine.runMapping({ sourceData, spec })
        expect(output).toEqual([{ po: 'PO-1', customer: 'Acme' }])
        expect(warnings).toEqual([
            { path: 'customer', code: 'header_mismatch', message: expect.stringContaining('CustomerName') },
        ])
    })
})
