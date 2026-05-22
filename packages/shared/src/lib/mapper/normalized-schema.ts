import { z } from 'zod'

const NormalizedFieldTypeSchema = z.enum([
    'string',
    'number',
    'boolean',
    'object',
    'array',
    'null',
    'unknown',
])

export const NormalizedFieldSchema: z.ZodType<NormalizedField> = z.lazy(() =>
    z.object({
        name: z.string(),
        type: NormalizedFieldTypeSchema,
        children: z.array(NormalizedFieldSchema).optional(),
    }),
)

export const NormalizedSchemaSchema = z.object({
    root: z.enum(['object', 'array']),
    fields: z.array(NormalizedFieldSchema),
})

export type NormalizedFieldType = z.infer<typeof NormalizedFieldTypeSchema>
export type NormalizedField = {
    name: string
    type: NormalizedFieldType
    children?: NormalizedField[]
}
export type NormalizedSchema = z.infer<typeof NormalizedSchemaSchema>
