import { MapperWarning } from '../mapper-warning'
import { applyTransforms } from './apply-transforms'

describe('applyTransforms', () => {
    test('applies transforms left-to-right', () => {
        const warnings: MapperWarning[] = []
        const out = applyTransforms({
            value: '  Hello  ',
            transforms: [{ id: 'trim' }, { id: 'lowercase' }],
            path: 'a',
            warnings,
        })
        expect(out).toBe('hello')
        expect(warnings).toEqual([])
    })

    test('unknown transform produces a warning and passes value through', () => {
        const warnings: MapperWarning[] = []
        const out = applyTransforms({ value: 'x', transforms: [{ id: 'nope' }], path: 'a', warnings })
        expect(out).toBe('x')
        expect(warnings).toEqual([{ path: 'a', code: 'unknown_transform', message: expect.stringContaining('nope') }])
    })

    test('throwing transform produces a warning and yields null', () => {
        const warnings: MapperWarning[] = []
        const out = applyTransforms({ value: 'abc', transforms: [{ id: 'parse_number' }], path: 'qty', warnings })
        expect(out).toBeNull()
        expect(warnings[0]).toMatchObject({ path: 'qty', code: 'transform_failed' })
    })

    test('no transforms returns the value unchanged', () => {
        const warnings: MapperWarning[] = []
        expect(applyTransforms({ value: 5, transforms: undefined, path: 'a', warnings })).toBe(5)
    })
})
