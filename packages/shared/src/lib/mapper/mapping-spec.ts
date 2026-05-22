import { z } from 'zod'
import { NormalizedSchemaSchema } from './normalized-schema'

const MapperModeSchema = z.enum(['auto', 'reshape', 'per_row', 'grouped'])

const TransformRefSchema = z.object({
    id: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
})

const ScalarBindingSchema = z.object({
    kind: z.enum(['header', 'row']),
    source: z.string(),
    transforms: z.array(TransformRefSchema).optional(),
})

export const BindingSchema: z.ZodType<Binding> = z.lazy(() =>
    z.union([
        ScalarBindingSchema,
        z.object({
            kind: z.literal('line_collection'),
            source: z.string().optional(),
            items: z.array(FieldMappingSchema),
        }),
    ]),
)

export const FieldMappingSchema: z.ZodType<FieldMapping> = z.lazy(() =>
    z.object({
        target: z.string(),
        binding: BindingSchema,
    }),
)

const TargetSchemaRefSchema = z.object({
    source: z.enum([
        'json_sample', 'json_schema', 'xml', 'html_table',
        'csv', 'xlsx', 'piece_schema', 'openapi', 'emergent',
    ]),
    ref: z.string().optional(),
    snapshot: NormalizedSchemaSchema.optional(),
})

export const MappingSpecSchema = z.object({
    specVersion: z.literal(1),
    mode: MapperModeSchema.default('auto'),
    groupBy: z.array(z.string()).optional(),
    targetSchema: TargetSchemaRefSchema.optional(),
    fields: z.array(FieldMappingSchema),
})

export type MapperMode = z.infer<typeof MapperModeSchema>
export type TransformRef = z.infer<typeof TransformRefSchema>
export type ScalarBinding = z.infer<typeof ScalarBindingSchema>
export type LineCollectionBinding = {
    kind: 'line_collection'
    source?: string
    items: FieldMapping[]
}
export type Binding = ScalarBinding | LineCollectionBinding
export type FieldMapping = {
    target: string
    binding: Binding
}
export type TargetSchemaRef = z.infer<typeof TargetSchemaRefSchema>
export type MappingSpec = z.infer<typeof MappingSpecSchema>
