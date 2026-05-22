import { MapperResult, MapperWarning } from '../mapper-warning'
import { MappingSpec } from '../mapping-spec'
import { detectMode } from './detect-mode'
import { partitionByKey } from './group'
import { shapeFields } from './shape'

type RunMappingParams = {
    sourceData: unknown
    spec: MappingSpec
}

function runMapping({ sourceData, spec }: RunMappingParams): MapperResult {
    const warnings: MapperWarning[] = []
    const mode = detectMode({ sourceData, spec })

    if (mode === 'reshape') {
        const output = shapeFields({
            fields: spec.fields,
            scope: { current: sourceData, rows: [sourceData] },
            basePath: '',
            warnings,
        })
        return { output, warnings }
    }

    const rows = Array.isArray(sourceData) ? sourceData : []

    if (mode === 'per_row') {
        const output = rows.map((row) =>
            shapeFields({ fields: spec.fields, scope: { current: row, rows: [row] }, basePath: '', warnings }),
        )
        return { output, warnings }
    }

    const groups = partitionByKey({ rows, groupBy: spec.groupBy ?? [] })
    const output = groups.map((group) =>
        shapeFields({ fields: spec.fields, scope: { current: group[0], rows: group }, basePath: '', warnings }),
    )
    return { output, warnings }
}

export const mapperEngine = { runMapping, detectMode }
