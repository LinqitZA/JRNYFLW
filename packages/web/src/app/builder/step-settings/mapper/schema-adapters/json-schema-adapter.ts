import { SchemaAdapter } from './adapter-type'
import { jsonSchemaConverter } from './json-schema-converter'

export const jsonSchemaAdapter: SchemaAdapter = {
    id: 'json_schema',
    parse: ({ raw }) => {
        let schema: unknown
        try {
            schema = JSON.parse(raw)
        }
        catch {
            throw new Error('Invalid JSON Schema document')
        }
        return jsonSchemaConverter.convert({ schema })
    },
}
