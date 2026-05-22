import { mapperPathUtils } from './path-utils'

const { getValueAtPath, setValueAtPath } = mapperPathUtils

describe('getValueAtPath', () => {
    test('reads a top-level key', () => {
        expect(getValueAtPath({ a: 1 }, 'a')).toBe(1)
    })
    test('reads a nested key', () => {
        expect(getValueAtPath({ a: { b: { c: 5 } } }, 'a.b.c')).toBe(5)
    })
    test('returns undefined for a missing path', () => {
        expect(getValueAtPath({ a: 1 }, 'a.b.c')).toBeUndefined()
    })
    test('returns undefined when traversing a non-object', () => {
        expect(getValueAtPath(42, 'a')).toBeUndefined()
    })
})

describe('setValueAtPath', () => {
    test('sets a top-level key', () => {
        const out = {}
        setValueAtPath(out, 'a', 1)
        expect(out).toEqual({ a: 1 })
    })
    test('creates intermediate objects', () => {
        const out = {}
        setValueAtPath(out, 'a.b.c', 5)
        expect(out).toEqual({ a: { b: { c: 5 } } })
    })
    test('does not clobber sibling keys', () => {
        const out = { a: { x: 1 } }
        setValueAtPath(out, 'a.y', 2)
        expect(out).toEqual({ a: { x: 1, y: 2 } })
    })
})
