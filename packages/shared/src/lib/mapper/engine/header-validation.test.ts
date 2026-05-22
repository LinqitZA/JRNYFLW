import { FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { collectHeaderMismatches } from './header-validation'

const fields: FieldMapping[] = [
    { target: 'po', binding: { kind: 'header', source: 'PO' } },
    { target: 'name', binding: { kind: 'header', source: 'CustomerName' } },
    { target: 'lines', binding: { kind: 'line_collection', items: [{ target: 'sku', binding: { kind: 'row', source: 'SKU' } }] } },
]

describe('collectHeaderMismatches', () => {
    test('no warning when header fields agree across the group', () => {
        const warnings: MapperWarning[] = []
        const group = [
            { PO: 'PO-1', CustomerName: 'Acme', SKU: 'A' },
            { PO: 'PO-1', CustomerName: 'Acme', SKU: 'B' },
        ]
        collectHeaderMismatches({ fields, group, warnings })
        expect(warnings).toEqual([])
    })

    test('warns on the specific field whose header value diverges', () => {
        const warnings: MapperWarning[] = []
        const group = [
            { PO: 'PO-1', CustomerName: 'Acme', SKU: 'A' },
            { PO: 'PO-1', CustomerName: 'Acme Corp', SKU: 'B' },
        ]
        collectHeaderMismatches({ fields, group, warnings })
        expect(warnings).toEqual([
            { path: 'name', code: 'header_mismatch', message: expect.stringContaining('CustomerName') },
        ])
    })

    test('ignores line_collection and row bindings', () => {
        const warnings: MapperWarning[] = []
        const group = [{ PO: 'PO-1', CustomerName: 'Acme', SKU: 'A' }, { PO: 'PO-1', CustomerName: 'Acme', SKU: 'B' }]
        collectHeaderMismatches({ fields, group, warnings })
        expect(warnings).toEqual([])
    })

    test('single-row group never warns', () => {
        const warnings: MapperWarning[] = []
        collectHeaderMismatches({ fields, group: [{ PO: 'PO-1', CustomerName: 'Acme', SKU: 'A' }], warnings })
        expect(warnings).toEqual([])
    })
})
