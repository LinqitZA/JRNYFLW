import { TransformRef } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { transformRegistry } from './transforms'

type ApplyTransformsParams = {
    value: unknown
    transforms: TransformRef[] | undefined
    path: string
    warnings: MapperWarning[]
}

export function applyTransforms({ value, transforms, path, warnings }: ApplyTransformsParams): unknown {
    if (!transforms || transforms.length === 0) {
        return value
    }
    let current = value
    for (const ref of transforms) {
        const transform = transformRegistry[ref.id]
        if (!transform) {
            warnings.push({ path, code: 'unknown_transform', message: `Unknown transform "${ref.id}"` })
            continue
        }
        try {
            current = transform.apply({ value: current, params: ref.params ?? {} })
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            warnings.push({ path, code: 'transform_failed', message: `Transform "${ref.id}" failed: ${message}` })
            current = null
        }
    }
    return current
}
