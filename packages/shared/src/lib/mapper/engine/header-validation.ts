import { FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { mapperPathUtils } from './path-utils'

type CollectHeaderMismatchesParams = {
    fields: FieldMapping[]
    group: unknown[]
    warnings: MapperWarning[]
}

export function collectHeaderMismatches({ fields, group, warnings }: CollectHeaderMismatchesParams): void {
    for (const field of fields) {
        if (field.binding.kind !== 'header') {
            continue
        }
        const source = field.binding.source
        const distinct = new Set(
            group.map((row) => JSON.stringify(mapperPathUtils.getValueAtPath(row, source))),
        )
        if (distinct.size > 1) {
            warnings.push({
                path: field.target,
                code: 'header_mismatch',
                message: `Header field "${source}" has differing values within a group; using the first`,
            })
        }
    }
}
