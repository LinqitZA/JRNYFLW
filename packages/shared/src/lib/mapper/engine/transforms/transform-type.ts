import { z } from 'zod'

export type TransformApplyInput = {
    value: unknown
    params: Record<string, unknown>
}

export type Transform = {
    id: string
    labelKey: string
    paramsSchema: z.ZodTypeAny
    apply: (input: TransformApplyInput) => unknown
}
