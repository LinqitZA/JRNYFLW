import { z } from 'zod'
import { Transform } from './transform-type'

const trim: Transform = {
    id: 'trim',
    labelKey: 'Trim whitespace',
    paramsSchema: z.object({}),
    apply: ({ value }) => String(value ?? '').trim(),
}

const lowercase: Transform = {
    id: 'lowercase',
    labelKey: 'Lowercase',
    paramsSchema: z.object({}),
    apply: ({ value }) => String(value ?? '').toLowerCase(),
}

const uppercase: Transform = {
    id: 'uppercase',
    labelKey: 'Uppercase',
    paramsSchema: z.object({}),
    apply: ({ value }) => String(value ?? '').toUpperCase(),
}

const concat: Transform = {
    id: 'concat',
    labelKey: 'Concatenate',
    paramsSchema: z.object({ value: z.string(), separator: z.string().optional() }),
    apply: ({ value, params }) => {
        const separator = typeof params['separator'] === 'string' ? params['separator'] : ''
        return `${String(value ?? '')}${separator}${String(params['value'] ?? '')}`
    },
}

const split: Transform = {
    id: 'split',
    labelKey: 'Split',
    paramsSchema: z.object({ separator: z.string(), index: z.number().optional() }),
    apply: ({ value, params }) => {
        const parts = String(value ?? '').split(String(params['separator']))
        const index = typeof params['index'] === 'number' ? params['index'] : 0
        return parts[index] ?? null
    },
}

const regexExtract: Transform = {
    id: 'regex_extract',
    labelKey: 'Extract with regex',
    paramsSchema: z.object({ pattern: z.string(), group: z.number().optional() }),
    apply: ({ value, params }) => {
        const re = new RegExp(String(params['pattern']))
        const match = String(value ?? '').match(re)
        if (!match) return null
        const group = typeof params['group'] === 'number' ? params['group'] : 0
        return match[group] ?? null
    },
}

export const stringTransforms: Transform[] = [trim, lowercase, uppercase, concat, split, regexExtract]
