// @vitest-environment jsdom
import { jsonSchemaAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter'

describe('jsonSchemaAdapter', () => {
    test('has id json_schema', () => {
        expect(jsonSchemaAdapter.id).toBe('json_schema')
    })

    test('parses a JSON Schema string into a NormalizedSchema', () => {
        const raw = JSON.stringify({ type: 'object', properties: { name: { type: 'string' } } })
        expect(jsonSchemaAdapter.parse({ raw })).toEqual({
            root: 'object',
            fields: [{ name: 'name', type: 'string' }],
        })
    })

    test('throws on invalid JSON', () => {
        expect(() => jsonSchemaAdapter.parse({ raw: '{bad' })).toThrow(/JSON/i)
    })
})
