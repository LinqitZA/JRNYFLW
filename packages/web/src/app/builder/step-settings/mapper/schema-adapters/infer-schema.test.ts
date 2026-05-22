// @vitest-environment jsdom
import { inferSchemaUtils } from './infer-schema'

const { inferSchemaFromSample } = inferSchemaUtils

describe('inferSchemaFromSample', () => {
    test('infers a flat object', () => {
        expect(inferSchemaFromSample({ name: 'Acme', age: 5, active: true })).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'age', type: 'number' },
                { name: 'active', type: 'boolean' },
            ],
        })
    })

    test('infers nested objects with children', () => {
        expect(inferSchemaFromSample({ customer: { name: 'Acme' } })).toEqual({
            root: 'object',
            fields: [
                { name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] },
            ],
        })
    })

    test('infers an array root from the first element', () => {
        expect(inferSchemaFromSample([{ sku: 'A', qty: 2 }, { sku: 'B', qty: 3 }])).toEqual({
            root: 'array',
            fields: [
                { name: 'sku', type: 'string' },
                { name: 'qty', type: 'number' },
            ],
        })
    })

    test('infers array-of-objects field with element children', () => {
        expect(inferSchemaFromSample({ lines: [{ sku: 'A' }] })).toEqual({
            root: 'object',
            fields: [
                { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
            ],
        })
    })

    test('array of scalars has no children', () => {
        expect(inferSchemaFromSample({ tags: ['a', 'b'] })).toEqual({
            root: 'object',
            fields: [{ name: 'tags', type: 'array' }],
        })
    })

    test('null and empty array yield null / array with no children', () => {
        expect(inferSchemaFromSample({ a: null, b: [] })).toEqual({
            root: 'object',
            fields: [
                { name: 'a', type: 'null' },
                { name: 'b', type: 'array' },
            ],
        })
    })

    test('empty array root yields array with no fields', () => {
        expect(inferSchemaFromSample([])).toEqual({ root: 'array', fields: [] })
    })

    test('throws on a scalar input', () => {
        expect(() => inferSchemaFromSample('hello')).toThrow()
    })
})
