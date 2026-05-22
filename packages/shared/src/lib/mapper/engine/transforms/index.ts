import { stringTransforms } from './string-transforms'
import { Transform } from './transform-type'
import { valueTransforms } from './value-transforms'

const buildRegistry = (): Record<string, Transform> => {
    const all = [...stringTransforms, ...valueTransforms]
    return all.reduce<Record<string, Transform>>((acc, transform) => {
        acc[transform.id] = transform
        return acc
    }, {})
}

export * from './transform-type'

export const transformRegistry: Record<string, Transform> = buildRegistry()
