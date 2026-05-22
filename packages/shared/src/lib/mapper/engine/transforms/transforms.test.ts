import { transformRegistry } from './index'

const run = (id: string, value: unknown, params: Record<string, unknown> = {}) =>
    transformRegistry[id].apply({ value, params })

describe('transform registry', () => {
    test('registers all 10 built-ins', () => {
        expect(Object.keys(transformRegistry).sort()).toEqual(
            ['concat', 'date_format', 'default', 'lookup', 'lowercase', 'parse_number', 'regex_extract', 'split', 'trim', 'uppercase'].sort(),
        )
    })

    test('trim removes surrounding whitespace', () => {
        expect(run('trim', '  hi  ')).toBe('hi')
    })
    test('lowercase / uppercase', () => {
        expect(run('lowercase', 'AbC')).toBe('abc')
        expect(run('uppercase', 'AbC')).toBe('ABC')
    })
    test('default substitutes when nil or empty', () => {
        expect(run('default', null, { value: 'x' })).toBe('x')
        expect(run('default', '', { value: 'x' })).toBe('x')
        expect(run('default', 'y', { value: 'x' })).toBe('y')
    })
    test('concat appends with a separator', () => {
        expect(run('concat', 'A', { value: 'B', separator: '-' })).toBe('A-B')
    })
    test('split returns the indexed segment', () => {
        expect(run('split', 'a,b,c', { separator: ',', index: 1 })).toBe('b')
    })
    test('regex_extract returns the chosen group', () => {
        expect(run('regex_extract', 'PO-12345', { pattern: 'PO-(\\d+)', group: 1 })).toBe('12345')
    })
    test('parse_number strips non-numerics', () => {
        expect(run('parse_number', 'R 1,250.50', {})).toBe(1250.5)
    })
    test('parse_number throws on unparseable input', () => {
        expect(() => run('parse_number', 'abc', {})).toThrow()
    })
    test('date_format formats an ISO date', () => {
        expect(run('date_format', '2026-05-22T08:09:10Z', { format: 'YYYY/MM/DD' })).toBe('2026/05/22')
    })
    test('lookup maps via table with fallback', () => {
        expect(run('lookup', 'ZA', { table: { ZA: 'South Africa' } })).toBe('South Africa')
        expect(run('lookup', 'XX', { table: { ZA: 'South Africa' }, fallback: '?' })).toBe('?')
    })
})
