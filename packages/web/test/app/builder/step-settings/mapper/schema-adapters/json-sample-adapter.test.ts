// @vitest-environment jsdom
import { jsonSampleAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter'

describe('jsonSampleAdapter', () => {
    test('has id json_sample', () => {
        expect(jsonSampleAdapter.id).toBe('json_sample')
    })

    test('parses a JSON object string into a NormalizedSchema', () => {
        expect(jsonSampleAdapter.parse({ raw: '{"name":"Acme","lines":[{"sku":"A"}]}' })).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
            ],
        })
    })

    test('throws a descriptive error on invalid JSON', () => {
        expect(() => jsonSampleAdapter.parse({ raw: 'not json' })).toThrow(/JSON/i)
    })
})
