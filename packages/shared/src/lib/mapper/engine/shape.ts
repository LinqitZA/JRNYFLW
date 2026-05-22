import { Binding, FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { applyTransforms } from './apply-transforms'
import { mapperPathUtils } from './path-utils'

type Scope = {
    current: unknown
    rows: unknown[]
}

type EvalBindingParams = {
    binding: Binding
    scope: Scope
    path: string
    warnings: MapperWarning[]
}

type ShapeFieldsParams = {
    fields: FieldMapping[]
    scope: Scope
    basePath: string
    warnings: MapperWarning[]
}

function evalBinding({ binding, scope, path, warnings }: EvalBindingParams): unknown {
    if (binding.kind === 'line_collection') {
        const rows = binding.source
            ? mapperPathUtils.getValueAtPath(scope.current, binding.source)
            : scope.rows
        if (!Array.isArray(rows)) {
            warnings.push({ path, code: 'not_an_array', message: `Expected an array at "${binding.source ?? '<group rows>'}"` })
            return []
        }
        return rows.map((row) =>
            shapeFields({ fields: binding.items, scope: { current: row, rows: [row] }, basePath: path, warnings }),
        )
    }

    const raw = mapperPathUtils.getValueAtPath(scope.current, binding.source)
    if (raw === undefined) {
        warnings.push({ path, code: 'missing_source', message: `Source field "${binding.source}" not found` })
        return applyTransforms({ value: null, transforms: binding.transforms, path, warnings })
    }
    return applyTransforms({ value: raw, transforms: binding.transforms, path, warnings })
}

export function shapeFields({ fields, scope, basePath, warnings }: ShapeFieldsParams): Record<string, unknown> {
    const output: Record<string, unknown> = {}
    for (const field of fields) {
        const path = basePath ? `${basePath}.${field.target}` : field.target
        const value = evalBinding({ binding: field.binding, scope, path, warnings })
        mapperPathUtils.setValueAtPath(output, field.target, value)
    }
    return output
}
