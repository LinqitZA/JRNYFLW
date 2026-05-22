// @vitest-environment jsdom
import { jsonSchemaConverter } from '@/app/builder/step-settings/mapper/schema-adapters/json-schema-converter'

const convert = (schema: unknown, root?: unknown) => jsonSchemaConverter.convert({ schema, root })

describe('jsonSchemaConverter.convert', () => {
    test('converts an object schema with typed properties', () => {
        const schema = {
            type: 'object',
            properties: { name: { type: 'string' }, age: { type: 'integer' } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'age', type: 'number' },
            ],
        })
    })

    test('converts nested object properties into children', () => {
        const schema = {
            type: 'object',
            properties: { customer: { type: 'object', properties: { name: { type: 'string' } } } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [{ name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] }],
        })
    })

    test('converts an array property whose items are objects', () => {
        const schema = {
            type: 'object',
            properties: { lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [{ name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] }],
        })
    })

    test('converts an array-root schema', () => {
        const schema = { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } }
        expect(convert(schema)).toEqual({ root: 'array', fields: [{ name: 'sku', type: 'string' }] })
    })

    test('resolves a local $ref against the provided root document', () => {
        const root = {
            components: { schemas: { Line: { type: 'object', properties: { sku: { type: 'string' } } } } },
        }
        const schema = { type: 'array', items: { $ref: '#/components/schemas/Line' } }
        expect(convert(schema, root)).toEqual({ root: 'array', fields: [{ name: 'sku', type: 'string' }] })
    })

    test('maps unknown/missing types to unknown', () => {
        const schema = { type: 'object', properties: { x: {} } }
        expect(convert(schema)).toEqual({ root: 'object', fields: [{ name: 'x', type: 'unknown' }] })
    })

    test('throws when the root schema is neither object nor array', () => {
        expect(() => convert({ type: 'string' })).toThrow()
    })
})
