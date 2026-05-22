import { MappingSpec } from '../mapping-spec'
import { detectMode } from './detect-mode'

const spec = (over: Partial<MappingSpec>): MappingSpec => ({ specVersion: 1, mode: 'auto', fields: [], ...over })

describe('detectMode', () => {
    test('single object → reshape', () => {
        expect(detectMode({ sourceData: { a: 1 }, spec: spec({}) })).toBe('reshape')
    })
    test('array without groupBy → per_row', () => {
        expect(detectMode({ sourceData: [{ a: 1 }], spec: spec({}) })).toBe('per_row')
    })
    test('array with groupBy → grouped', () => {
        expect(detectMode({ sourceData: [{ a: 1 }], spec: spec({ groupBy: ['a'] }) })).toBe('grouped')
    })
    test('explicit mode overrides auto-detection', () => {
        expect(detectMode({ sourceData: { a: 1 }, spec: spec({ mode: 'per_row' }) })).toBe('per_row')
    })
})
