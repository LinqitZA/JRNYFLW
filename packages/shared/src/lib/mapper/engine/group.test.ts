import { partitionByKey } from './group'

describe('partitionByKey', () => {
    test('buckets rows by a single key, preserving first-seen order', () => {
        const rows = [
            { po: 'A', sku: 'x' },
            { po: 'B', sku: 'y' },
            { po: 'A', sku: 'z' },
        ]
        expect(partitionByKey({ rows, groupBy: ['po'] })).toEqual([
            [{ po: 'A', sku: 'x' }, { po: 'A', sku: 'z' }],
            [{ po: 'B', sku: 'y' }],
        ])
    })

    test('buckets by a composite key', () => {
        const rows = [
            { po: 'A', whse: '01' },
            { po: 'A', whse: '02' },
            { po: 'A', whse: '01' },
        ]
        expect(partitionByKey({ rows, groupBy: ['po', 'whse'] })).toHaveLength(2)
    })

    test('empty input yields no groups', () => {
        expect(partitionByKey({ rows: [], groupBy: ['po'] })).toEqual([])
    })
})
