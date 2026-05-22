// @vitest-environment jsdom
import { csvAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/csv-adapter'

describe('csvAdapter', () => {
    test('has id csv', () => {
        expect(csvAdapter.id).toBe('csv')
    })

    test('parses a CSV with a header row into an array schema', () => {
        const raw = 'sku,qty\nA,2\nB,3'
        expect(csvAdapter.parse({ raw })).toEqual({
            root: 'array',
            fields: [
                { name: 'sku', type: 'string' },
                { name: 'qty', type: 'string' },
            ],
        })
    })

    test('throws on empty input', () => {
        expect(() => csvAdapter.parse({ raw: '' })).toThrow(/CSV/i)
    })
})
