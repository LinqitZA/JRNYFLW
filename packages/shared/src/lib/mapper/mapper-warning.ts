export type MapperWarning = {
    path: string
    code: 'missing_source' | 'transform_failed' | 'unknown_transform' | 'header_mismatch' | 'not_an_array'
    message: string
}

export type MapperResult = {
    output: unknown
    warnings: MapperWarning[]
}
