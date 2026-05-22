import { MappingSpec } from '../mapping-spec'

type ResolvedMode = 'reshape' | 'per_row' | 'grouped'

type DetectModeParams = {
    sourceData: unknown
    spec: MappingSpec
}

export function detectMode({ sourceData, spec }: DetectModeParams): ResolvedMode {
    if (spec.mode !== 'auto') {
        return spec.mode
    }
    if (Array.isArray(sourceData)) {
        return spec.groupBy && spec.groupBy.length > 0 ? 'grouped' : 'per_row'
    }
    return 'reshape'
}
