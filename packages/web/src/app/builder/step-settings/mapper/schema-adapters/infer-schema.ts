import { NormalizedField, NormalizedFieldType, NormalizedSchema } from '@activepieces/shared'

function inferType(value: unknown): NormalizedFieldType {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    switch (typeof value) {
        case 'string': return 'string'
        case 'number': return 'number'
        case 'boolean': return 'boolean'
        case 'object': return 'object'
        default: return 'unknown'
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferField(name: string, value: unknown): NormalizedField {
    const type = inferType(value)
    if (type === 'object') {
        return { name, type, children: inferFields(value) }
    }
    if (type === 'array') {
        const first = (value as unknown[])[0]
        if (isPlainObject(first)) {
            return { name, type, children: inferFields(first) }
        }
        return { name, type }
    }
    return { name, type }
}

function inferFields(value: unknown): NormalizedField[] {
    if (!isPlainObject(value)) return []
    return Object.entries(value).map(([key, val]) => inferField(key, val))
}

function inferSchemaFromSample(value: unknown): NormalizedSchema {
    if (Array.isArray(value)) {
        const first = value[0]
        return { root: 'array', fields: isPlainObject(first) ? inferFields(first) : [] }
    }
    if (isPlainObject(value)) {
        return { root: 'object', fields: inferFields(value) }
    }
    throw new Error('Sample must be an object or an array of objects')
}

export const inferSchemaUtils = { inferSchemaFromSample, inferType }
