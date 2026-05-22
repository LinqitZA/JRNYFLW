import { NormalizedField, NormalizedFieldType, NormalizedSchema } from '@activepieces/shared'

type JsonSchemaNode = Record<string, unknown>

function isObjectNode(value: unknown): value is JsonSchemaNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(node: JsonSchemaNode, root: unknown): JsonSchemaNode {
    const ref = node['$ref']
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return node
    const segments = ref.slice(2).split('/')
    let current: unknown = root
    for (const segment of segments) {
        if (!isObjectNode(current)) return node
        current = current[segment]
    }
    return isObjectNode(current) ? current : node
}

function mapType(jsonType: unknown): NormalizedFieldType {
    switch (jsonType) {
        case 'string': return 'string'
        case 'integer':
        case 'number': return 'number'
        case 'boolean': return 'boolean'
        case 'object': return 'object'
        case 'array': return 'array'
        case 'null': return 'null'
        default: return 'unknown'
    }
}

function convertField(name: string, rawNode: JsonSchemaNode, root: unknown): NormalizedField {
    const node = resolveRef(rawNode, root)
    const type = mapType(node['type'])
    if (type === 'object') {
        return { name, type, children: convertProperties(node, root) }
    }
    if (type === 'array') {
        const items = node['items']
        if (isObjectNode(items)) {
            const resolvedItems = resolveRef(items, root)
            if (mapType(resolvedItems['type']) === 'object') {
                return { name, type, children: convertProperties(resolvedItems, root) }
            }
        }
        return { name, type }
    }
    return { name, type }
}

function convertProperties(node: JsonSchemaNode, root: unknown): NormalizedField[] {
    const properties = node['properties']
    if (!isObjectNode(properties)) return []
    return Object.entries(properties).map(([name, child]) =>
        convertField(name, isObjectNode(child) ? child : {}, root),
    )
}

type ConvertParams = {
    schema: unknown
    root?: unknown
}

function convert({ schema, root }: ConvertParams): NormalizedSchema {
    if (!isObjectNode(schema)) {
        throw new Error('JSON Schema must be an object')
    }
    const document = root ?? schema
    const resolved = resolveRef(schema, document)
    const rootType = mapType(resolved['type'])
    if (rootType === 'object') {
        return { root: 'object', fields: convertProperties(resolved, document) }
    }
    if (rootType === 'array') {
        const items = resolved['items']
        const resolvedItems = isObjectNode(items) ? resolveRef(items, document) : {}
        return { root: 'array', fields: convertProperties(resolvedItems, document) }
    }
    throw new Error('Root JSON Schema must describe an object or an array')
}

export const jsonSchemaConverter = { convert }
