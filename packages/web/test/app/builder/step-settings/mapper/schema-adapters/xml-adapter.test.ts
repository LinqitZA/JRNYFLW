// @vitest-environment jsdom
import { xmlAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/xml-adapter'

describe('xmlAdapter', () => {
    test('has id xml', () => {
        expect(xmlAdapter.id).toBe('xml')
    })

    test('parses an XML fragment into a NormalizedSchema', () => {
        const raw = '<order><customer>Acme</customer><total>100</total></order>'
        expect(xmlAdapter.parse({ raw })).toEqual({
            root: 'object',
            fields: [
                { name: 'customer', type: 'string' },
                { name: 'total', type: 'number' },
            ],
        })
    })

    test('throws on invalid XML', () => {
        expect(() => xmlAdapter.parse({ raw: '<a><b>' })).toThrow(/XML/i)
    })
})
