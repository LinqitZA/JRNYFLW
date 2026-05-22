import { z } from 'zod'
import { Transform } from './transform-type'

const isNilOrEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === ''

const defaultTransform: Transform = {
    id: 'default',
    labelKey: 'Default value',
    paramsSchema: z.object({ value: z.unknown() }),
    apply: ({ value, params }) => (isNilOrEmpty(value) ? params.value : value),
}

const parseNumber: Transform = {
    id: 'parse_number',
    labelKey: 'Parse number',
    paramsSchema: z.object({}),
    apply: ({ value }) => {
        if (typeof value === 'number') return value
        const cleaned = String(value ?? '').replace(/[^0-9.\-]/g, '')
        const parsed = Number(cleaned)
        if (cleaned === '' || Number.isNaN(parsed)) {
            throw new Error(`Cannot parse "${String(value)}" as a number`)
        }
        return parsed
    },
}

const lookup: Transform = {
    id: 'lookup',
    labelKey: 'Lookup table',
    paramsSchema: z.object({ table: z.record(z.string(), z.unknown()), fallback: z.unknown().optional() }),
    apply: ({ value, params }) => {
        const table = (params.table ?? {}) as Record<string, unknown>
        const key = String(value ?? '')
        if (key in table) return table[key]
        return 'fallback' in params ? params.fallback : value
    },
}

const dateFormat: Transform = {
    id: 'date_format',
    labelKey: 'Format date',
    paramsSchema: z.object({ format: z.string() }),
    apply: ({ value, params }) => {
        const date = value instanceof Date ? value : new Date(String(value))
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Cannot parse "${String(value)}" as a date`)
        }
        const pad = (n: number) => String(n).padStart(2, '0')
        const tokens: Record<string, string> = {
            YYYY: String(date.getUTCFullYear()),
            MM: pad(date.getUTCMonth() + 1),
            DD: pad(date.getUTCDate()),
            HH: pad(date.getUTCHours()),
            mm: pad(date.getUTCMinutes()),
            ss: pad(date.getUTCSeconds()),
        }
        return String(params.format).replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => tokens[t])
    },
}

export const valueTransforms: Transform[] = [defaultTransform, parseNumber, lookup, dateFormat]
