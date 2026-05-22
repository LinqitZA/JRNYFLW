# Visual Mapper — Engine & Piece Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic mapping engine and the `@jrnyflw/mapper` piece's `apply_mapping` action, so a flow author can transform one step's output into another step's input shape — including N→1 row grouping — driven by a declarative JSON mapping spec.

**Architecture:** All spec types and the engine live in `@activepieces/shared` (`packages/shared/src/lib/mapper/`) so they are isomorphic — the `apply_mapping` action and the future in-browser preview (Plan 2) import the exact same `runMapping`. The engine is a pure pipeline: `detectMode → partition (grouped only) → shape (walk fields, evaluate bindings, apply transforms)`. The `@jrnyflw/mapper` piece (`packages/pieces/custom/mapper/`) is a thin wrapper that parses the spec and calls the engine. No I/O, no side effects.

**Tech Stack:** TypeScript, Zod 4.3.6 (validation, already in shared), Vitest (already wired for shared + pieces), Activepieces pieces-framework (`createPiece`/`createAction`/`Property`).

**Spec:** `docs/superpowers/specs/2026-05-22-visual-mapper-v1-design.md`

**Out of scope for Plan 1 (in Plan 2):** all schema adapters (XML/CSV/OpenAPI/etc. → NormalizedSchema parsing — these are design-time concerns), the visual canvas UI, bind-lines, transform picker, preview pane. This plan only needs the `NormalizedSchema` *type* (for `targetSchema.snapshot`), not the adapters that produce it.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/lib/mapper/normalized-schema.ts` | `NormalizedSchema` / `NormalizedField` types + Zod (target slot tree shape) |
| `packages/shared/src/lib/mapper/mapper-warning.ts` | `MapperWarning`, `MapperResult` types (pure types, no runtime) |
| `packages/shared/src/lib/mapper/mapping-spec.ts` | `MappingSpec`, `Binding`, `FieldMapping`, `TransformRef`, `MapperMode` Zod schemas + types |
| `packages/shared/src/lib/mapper/engine/path-utils.ts` | `mapperPathUtils.getValueAtPath` / `setValueAtPath` (dot-path read/write) |
| `packages/shared/src/lib/mapper/engine/transforms/*.ts` | One file per built-in transform |
| `packages/shared/src/lib/mapper/engine/transforms/index.ts` | `transformRegistry` aggregating all transforms |
| `packages/shared/src/lib/mapper/engine/apply-transforms.ts` | `applyTransforms` — runs a transform chain, collects warnings |
| `packages/shared/src/lib/mapper/engine/detect-mode.ts` | `detectMode` — resolves `auto` against source data |
| `packages/shared/src/lib/mapper/engine/group.ts` | `partitionByKey` — buckets rows by composite groupBy key |
| `packages/shared/src/lib/mapper/engine/shape.ts` | `shapeFields` / `evalBinding` — the recursive shaping core |
| `packages/shared/src/lib/mapper/engine/index.ts` | `mapperEngine.runMapping` — orchestrator |
| `packages/shared/src/lib/mapper/index.ts` | Barrel — re-exports everything above |
| `packages/shared/src/index.ts` | Add `export * from './lib/mapper'` |
| `packages/shared/package.json` | Version bump `0.71.0` → `0.72.0` |
| `packages/pieces/custom/mapper/` | New piece (package.json, tsconfigs, vitest config, index.ts, action) |
| `tsconfig.base.json` | Add `@jrnyflw/mapper` path entry |

---

## Key Type & Engine Contracts (locked here, referenced by every task)

**`Binding`** is a discriminated union with three `kind`s:
- `header` — `{ kind: 'header'; source: string; transforms?: TransformRef[] }` — one value per output object (group header / single object).
- `row` — `{ kind: 'row'; source: string; transforms?: TransformRef[] }` — value from the current row (used inside `line_collection`, or top-level in per-row mode).
- `line_collection` — `{ kind: 'line_collection'; source?: string; items: FieldMapping[] }` — produces an array. Iterates the current group's rows (grouped mode, no `source`) or the array found at `source` on the current object (reshape of nested arrays). Each element is shaped by `items`.

**Scope** — the engine evaluates every output object against a `Scope`:
```ts
type Scope = { current: unknown; rows: unknown[] }
```
- reshape: `{ current: sourceData, rows: [sourceData] }`
- per-row: `{ current: row, rows: [row] }` (one per input row)
- grouped: `{ current: group[0], rows: group }` (one per unique key)

`header` and `row` both read `getValueAtPath(scope.current, source)` — the distinction is authoring intent and is preserved in the spec, but evaluation is identical given the scope. `line_collection` iterates `scope.rows` (or `getValueAtPath(scope.current, source)` when `source` is set) and re-shapes each element under `{ current: element, rows: [element] }`.

---

## Task 1: Scaffold shared mapper types — NormalizedSchema & warnings

**Files:**
- Create: `packages/shared/src/lib/mapper/normalized-schema.ts`
- Create: `packages/shared/src/lib/mapper/mapper-warning.ts`
- Create: `packages/shared/src/lib/mapper/normalized-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/normalized-schema.test.ts`:
```ts
import { NormalizedSchemaSchema } from './normalized-schema'

describe('NormalizedSchemaSchema', () => {
  test('parses a nested object schema', () => {
    const input = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        {
          name: 'lines',
          type: 'array',
          children: [{ name: 'sku', type: 'string' }],
        },
      ],
    }
    expect(NormalizedSchemaSchema.parse(input)).toEqual(input)
  })

  test('rejects an unknown field type', () => {
    const input = { root: 'object', fields: [{ name: 'x', type: 'date' }] }
    expect(() => NormalizedSchemaSchema.parse(input)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/normalized-schema.test.ts`
Expected: FAIL — cannot find module `./normalized-schema`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/normalized-schema.ts`:
```ts
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
```

`packages/shared/src/lib/mapper/mapper-warning.ts`:
```ts
export type MapperWarning = {
    path: string
    code: 'missing_source' | 'transform_failed' | 'unknown_transform' | 'header_mismatch' | 'not_an_array'
    message: string
}

export type MapperResult = {
    output: unknown
    warnings: MapperWarning[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/normalized-schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/normalized-schema.ts packages/shared/src/lib/mapper/mapper-warning.ts packages/shared/src/lib/mapper/normalized-schema.test.ts
git commit -m "feat(mapper): NormalizedSchema and warning types in shared"
```

---

## Task 2: Mapping spec types (recursive bindings)

**Files:**
- Create: `packages/shared/src/lib/mapper/mapping-spec.ts`
- Create: `packages/shared/src/lib/mapper/mapping-spec.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/mapping-spec.test.ts`:
```ts
import { MappingSpecSchema } from './mapping-spec'

describe('MappingSpecSchema', () => {
  test('parses a grouped spec with a line_collection', () => {
    const spec = {
      specVersion: 1,
      mode: 'auto',
      groupBy: ['CustomerPONumber'],
      fields: [
        { target: 'customer.po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
        {
          target: 'lines',
          binding: {
            kind: 'line_collection',
            items: [
              { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
              { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
            ],
          },
        },
      ],
    }
    expect(MappingSpecSchema.parse(spec)).toMatchObject({ specVersion: 1, mode: 'auto' })
  })

  test('defaults mode to auto when omitted', () => {
    const parsed = MappingSpecSchema.parse({ specVersion: 1, fields: [] })
    expect(parsed.mode).toBe('auto')
  })

  test('rejects an unknown binding kind', () => {
    const spec = { specVersion: 1, fields: [{ target: 'x', binding: { kind: 'wat', source: 'a' } }] }
    expect(() => MappingSpecSchema.parse(spec)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/mapping-spec.test.ts`
Expected: FAIL — cannot find module `./mapping-spec`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/mapping-spec.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/mapping-spec.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/mapping-spec.ts packages/shared/src/lib/mapper/mapping-spec.test.ts
git commit -m "feat(mapper): mapping spec types with recursive bindings"
```

---

## Task 3: Path utilities (dot-path read/write)

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/path-utils.ts`
- Create: `packages/shared/src/lib/mapper/engine/path-utils.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/path-utils.test.ts`:
```ts
import { mapperPathUtils } from './path-utils'

const { getValueAtPath, setValueAtPath } = mapperPathUtils

describe('getValueAtPath', () => {
  test('reads a top-level key', () => {
    expect(getValueAtPath({ a: 1 }, 'a')).toBe(1)
  })
  test('reads a nested key', () => {
    expect(getValueAtPath({ a: { b: { c: 5 } } }, 'a.b.c')).toBe(5)
  })
  test('returns undefined for a missing path', () => {
    expect(getValueAtPath({ a: 1 }, 'a.b.c')).toBeUndefined()
  })
  test('returns undefined when traversing a non-object', () => {
    expect(getValueAtPath(42, 'a')).toBeUndefined()
  })
})

describe('setValueAtPath', () => {
  test('sets a top-level key', () => {
    const out = {}
    setValueAtPath(out, 'a', 1)
    expect(out).toEqual({ a: 1 })
  })
  test('creates intermediate objects', () => {
    const out = {}
    setValueAtPath(out, 'a.b.c', 5)
    expect(out).toEqual({ a: { b: { c: 5 } } })
  })
  test('does not clobber sibling keys', () => {
    const out = { a: { x: 1 } }
    setValueAtPath(out, 'a.y', 2)
    expect(out).toEqual({ a: { x: 1, y: 2 } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/path-utils.test.ts`
Expected: FAIL — cannot find module `./path-utils`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/path-utils.ts`:
```ts
function getValueAtPath(source: unknown, path: string): unknown {
    const segments = path.split('.')
    let current: unknown = source
    for (const segment of segments) {
        if (current === null || typeof current !== 'object') {
            return undefined
        }
        current = (current as Record<string, unknown>)[segment]
    }
    return current
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path.split('.')
    let current = target
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]
        const next = current[segment]
        if (next === null || typeof next !== 'object' || Array.isArray(next)) {
            current[segment] = {}
        }
        current = current[segment] as Record<string, unknown>
    }
    current[segments[segments.length - 1]] = value
}

export const mapperPathUtils = { getValueAtPath, setValueAtPath }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/path-utils.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/path-utils.ts packages/shared/src/lib/mapper/engine/path-utils.test.ts
git commit -m "feat(mapper): dot-path read/write utilities"
```

---

## Task 4: Transform registry (10 built-in transforms)

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/transforms/transform-type.ts`
- Create: `packages/shared/src/lib/mapper/engine/transforms/string-transforms.ts`
- Create: `packages/shared/src/lib/mapper/engine/transforms/value-transforms.ts`
- Create: `packages/shared/src/lib/mapper/engine/transforms/index.ts`
- Create: `packages/shared/src/lib/mapper/engine/transforms/transforms.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/transforms/transforms.test.ts`:
```ts
import { transformRegistry } from './index'

const run = (id: string, value: unknown, params: Record<string, unknown> = {}) =>
  transformRegistry[id].apply({ value, params })

describe('transform registry', () => {
  test('registers all 10 built-ins', () => {
    expect(Object.keys(transformRegistry).sort()).toEqual(
      ['concat', 'date_format', 'default', 'lookup', 'lowercase', 'parse_number', 'regex_extract', 'split', 'trim', 'uppercase'].sort(),
    )
  })

  test('trim removes surrounding whitespace', () => {
    expect(run('trim', '  hi  ')).toBe('hi')
  })
  test('lowercase / uppercase', () => {
    expect(run('lowercase', 'AbC')).toBe('abc')
    expect(run('uppercase', 'AbC')).toBe('ABC')
  })
  test('default substitutes when nil or empty', () => {
    expect(run('default', null, { value: 'x' })).toBe('x')
    expect(run('default', '', { value: 'x' })).toBe('x')
    expect(run('default', 'y', { value: 'x' })).toBe('y')
  })
  test('concat appends with a separator', () => {
    expect(run('concat', 'A', { value: 'B', separator: '-' })).toBe('A-B')
  })
  test('split returns the indexed segment', () => {
    expect(run('split', 'a,b,c', { separator: ',', index: 1 })).toBe('b')
  })
  test('regex_extract returns the chosen group', () => {
    expect(run('regex_extract', 'PO-12345', { pattern: 'PO-(\\d+)', group: 1 })).toBe('12345')
  })
  test('parse_number strips non-numerics', () => {
    expect(run('parse_number', 'R 1,250.50', {})).toBe(1250.5)
  })
  test('parse_number throws on unparseable input', () => {
    expect(() => run('parse_number', 'abc', {})).toThrow()
  })
  test('date_format formats an ISO date', () => {
    expect(run('date_format', '2026-05-22T08:09:10Z', { format: 'YYYY/MM/DD' })).toBe('2026/05/22')
  })
  test('lookup maps via table with fallback', () => {
    expect(run('lookup', 'ZA', { table: { ZA: 'South Africa' } })).toBe('South Africa')
    expect(run('lookup', 'XX', { table: { ZA: 'South Africa' }, fallback: '?' })).toBe('?')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/transforms/transforms.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/transforms/transform-type.ts`:
```ts
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
```

`packages/shared/src/lib/mapper/engine/transforms/string-transforms.ts`:
```ts
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
        const separator = typeof params.separator === 'string' ? params.separator : ''
        return `${String(value ?? '')}${separator}${String(params.value ?? '')}`
    },
}

const split: Transform = {
    id: 'split',
    labelKey: 'Split',
    paramsSchema: z.object({ separator: z.string(), index: z.number().optional() }),
    apply: ({ value, params }) => {
        const parts = String(value ?? '').split(String(params.separator))
        const index = typeof params.index === 'number' ? params.index : 0
        return parts[index] ?? null
    },
}

const regexExtract: Transform = {
    id: 'regex_extract',
    labelKey: 'Extract with regex',
    paramsSchema: z.object({ pattern: z.string(), group: z.number().optional() }),
    apply: ({ value, params }) => {
        const re = new RegExp(String(params.pattern))
        const match = String(value ?? '').match(re)
        if (!match) return null
        const group = typeof params.group === 'number' ? params.group : 0
        return match[group] ?? null
    },
}

export const stringTransforms: Transform[] = [trim, lowercase, uppercase, concat, split, regexExtract]
```

`packages/shared/src/lib/mapper/engine/transforms/value-transforms.ts`:
```ts
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
```

`packages/shared/src/lib/mapper/engine/transforms/index.ts`:
```ts
import { stringTransforms } from './string-transforms'
import { Transform } from './transform-type'
import { valueTransforms } from './value-transforms'

const buildRegistry = (): Record<string, Transform> => {
    const all = [...stringTransforms, ...valueTransforms]
    return all.reduce<Record<string, Transform>>((acc, transform) => {
        acc[transform.id] = transform
        return acc
    }, {})
}

export const transformRegistry: Record<string, Transform> = buildRegistry()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/transforms/transforms.test.ts`
Expected: PASS (all transform tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/transforms/
git commit -m "feat(mapper): built-in transform registry (10 transforms)"
```

---

## Task 5: applyTransforms chain (warning collection)

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/apply-transforms.ts`
- Create: `packages/shared/src/lib/mapper/engine/apply-transforms.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/apply-transforms.test.ts`:
```ts
import { MapperWarning } from '../mapper-warning'
import { applyTransforms } from './apply-transforms'

describe('applyTransforms', () => {
  test('applies transforms left-to-right', () => {
    const warnings: MapperWarning[] = []
    const out = applyTransforms({
      value: '  Hello  ',
      transforms: [{ id: 'trim' }, { id: 'lowercase' }],
      path: 'a',
      warnings,
    })
    expect(out).toBe('hello')
    expect(warnings).toEqual([])
  })

  test('unknown transform produces a warning and passes value through', () => {
    const warnings: MapperWarning[] = []
    const out = applyTransforms({ value: 'x', transforms: [{ id: 'nope' }], path: 'a', warnings })
    expect(out).toBe('x')
    expect(warnings).toEqual([{ path: 'a', code: 'unknown_transform', message: expect.stringContaining('nope') }])
  })

  test('throwing transform produces a warning and yields null', () => {
    const warnings: MapperWarning[] = []
    const out = applyTransforms({ value: 'abc', transforms: [{ id: 'parse_number' }], path: 'qty', warnings })
    expect(out).toBeNull()
    expect(warnings[0]).toMatchObject({ path: 'qty', code: 'transform_failed' })
  })

  test('no transforms returns the value unchanged', () => {
    const warnings: MapperWarning[] = []
    expect(applyTransforms({ value: 5, transforms: undefined, path: 'a', warnings })).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/apply-transforms.test.ts`
Expected: FAIL — cannot find module `./apply-transforms`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/apply-transforms.ts`:
```ts
import { TransformRef } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { transformRegistry } from './transforms'

type ApplyTransformsParams = {
    value: unknown
    transforms: TransformRef[] | undefined
    path: string
    warnings: MapperWarning[]
}

export function applyTransforms({ value, transforms, path, warnings }: ApplyTransformsParams): unknown {
    if (!transforms || transforms.length === 0) {
        return value
    }
    let current = value
    for (const ref of transforms) {
        const transform = transformRegistry[ref.id]
        if (!transform) {
            warnings.push({ path, code: 'unknown_transform', message: `Unknown transform "${ref.id}"` })
            continue
        }
        try {
            current = transform.apply({ value: current, params: ref.params ?? {} })
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            warnings.push({ path, code: 'transform_failed', message: `Transform "${ref.id}" failed: ${message}` })
            current = null
        }
    }
    return current
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/apply-transforms.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/apply-transforms.ts packages/shared/src/lib/mapper/engine/apply-transforms.test.ts
git commit -m "feat(mapper): transform chain with warning collection"
```

---

## Task 6: detectMode

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/detect-mode.ts`
- Create: `packages/shared/src/lib/mapper/engine/detect-mode.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/detect-mode.test.ts`:
```ts
import { MappingSpec } from '../mapping-spec'
import { detectMode } from './detect-mode'

const spec = (over: Partial<MappingSpec>): MappingSpec => ({ specVersion: 1, mode: 'auto', fields: [], ...over })

describe('detectMode', () => {
  test('single object → reshape', () => {
    expect(detectMode({ sourceData: { a: 1 }, spec: spec({}) })).toBe('reshape')
  })
  test('array without groupBy → per_row', () => {
    expect(detectMode({ sourceData: [{ a: 1 }], spec: spec({}) })).toBe('per_row')
  })
  test('array with groupBy → grouped', () => {
    expect(detectMode({ sourceData: [{ a: 1 }], spec: spec({ groupBy: ['a'] }) })).toBe('grouped')
  })
  test('explicit mode overrides auto-detection', () => {
    expect(detectMode({ sourceData: { a: 1 }, spec: spec({ mode: 'per_row' }) })).toBe('per_row')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/detect-mode.test.ts`
Expected: FAIL — cannot find module `./detect-mode`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/detect-mode.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/detect-mode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/detect-mode.ts packages/shared/src/lib/mapper/engine/detect-mode.test.ts
git commit -m "feat(mapper): runtime mode detection"
```

---

## Task 7: partitionByKey (grouping)

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/group.ts`
- Create: `packages/shared/src/lib/mapper/engine/group.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/group.test.ts`:
```ts
import { partitionByKey } from './group'

describe('partitionByKey', () => {
  test('buckets rows by a single key, preserving first-seen order', () => {
    const rows = [
      { po: 'A', sku: 'x' },
      { po: 'B', sku: 'y' },
      { po: 'A', sku: 'z' },
    ]
    expect(partitionByKey({ rows, groupBy: ['po'] })).toEqual([
      [{ po: 'A', sku: 'x' }, { po: 'A', sku: 'z' }],
      [{ po: 'B', sku: 'y' }],
    ])
  })

  test('buckets by a composite key', () => {
    const rows = [
      { po: 'A', whse: '01' },
      { po: 'A', whse: '02' },
      { po: 'A', whse: '01' },
    ]
    expect(partitionByKey({ rows, groupBy: ['po', 'whse'] })).toHaveLength(2)
  })

  test('empty input yields no groups', () => {
    expect(partitionByKey({ rows: [], groupBy: ['po'] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/group.test.ts`
Expected: FAIL — cannot find module `./group`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/group.ts`:
```ts
import { mapperPathUtils } from './path-utils'

type PartitionParams = {
    rows: unknown[]
    groupBy: string[]
}

export function partitionByKey({ rows, groupBy }: PartitionParams): unknown[][] {
    const order: string[] = []
    const buckets = new Map<string, unknown[]>()
    for (const row of rows) {
        const composite = groupBy.map((key) => mapperPathUtils.getValueAtPath(row, key))
        const hash = JSON.stringify(composite)
        if (!buckets.has(hash)) {
            buckets.set(hash, [])
            order.push(hash)
        }
        buckets.get(hash)!.push(row)
    }
    return order.map((hash) => buckets.get(hash)!)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/group.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/group.ts packages/shared/src/lib/mapper/engine/group.test.ts
git commit -m "feat(mapper): partition rows by composite group key"
```

---

## Task 8: shapeFields & evalBinding (recursive shaping core)

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/shape.ts`
- Create: `packages/shared/src/lib/mapper/engine/shape.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/shape.test.ts`:
```ts
import { FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { shapeFields } from './shape'

const shape = (fields: FieldMapping[], scope: { current: unknown; rows: unknown[] }) => {
  const warnings: MapperWarning[] = []
  const output = shapeFields({ fields, scope, basePath: '', warnings })
  return { output, warnings }
}

describe('shapeFields', () => {
  test('writes scalar header bindings to nested target paths', () => {
    const { output } = shape(
      [{ target: 'customer.name', binding: { kind: 'header', source: 'CustomerName' } }],
      { current: { CustomerName: 'Acme' }, rows: [{ CustomerName: 'Acme' }] },
    )
    expect(output).toEqual({ customer: { name: 'Acme' } })
  })

  test('applies transforms in a binding', () => {
    const { output } = shape(
      [{ target: 'qty', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } }],
      { current: { Qty: '7' }, rows: [{ Qty: '7' }] },
    )
    expect(output).toEqual({ qty: 7 })
  })

  test('missing source yields null and a warning', () => {
    const { output, warnings } = shape(
      [{ target: 'x', binding: { kind: 'header', source: 'Nope' } }],
      { current: { a: 1 }, rows: [{ a: 1 }] },
    )
    expect(output).toEqual({ x: null })
    expect(warnings[0]).toMatchObject({ path: 'x', code: 'missing_source' })
  })

  test('line_collection over scope.rows builds an array of shaped items', () => {
    const fields: FieldMapping[] = [
      {
        target: 'lines',
        binding: {
          kind: 'line_collection',
          items: [
            { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
            { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
          ],
        },
      },
    ]
    const rows = [{ SKU: 'A1', Qty: '2' }, { SKU: 'B2', Qty: '3' }]
    const { output } = shape(fields, { current: rows[0], rows })
    expect(output).toEqual({ lines: [{ product_code: 'A1', quantity: 2 }, { product_code: 'B2', quantity: 3 }] })
  })

  test('line_collection with explicit source iterates a nested array', () => {
    const fields: FieldMapping[] = [
      {
        target: 'items',
        binding: {
          kind: 'line_collection',
          source: 'cart.products',
          items: [{ target: 'code', binding: { kind: 'row', source: 'id' } }],
        },
      },
    ]
    const obj = { cart: { products: [{ id: 'p1' }, { id: 'p2' }] } }
    const { output } = shape(fields, { current: obj, rows: [obj] })
    expect(output).toEqual({ items: [{ code: 'p1' }, { code: 'p2' }] })
  })

  test('line_collection over a non-array source yields [] and a warning', () => {
    const fields: FieldMapping[] = [
      { target: 'items', binding: { kind: 'line_collection', source: 'missing', items: [] } },
    ]
    const { output, warnings } = shape(fields, { current: {}, rows: [{}] })
    expect(output).toEqual({ items: [] })
    expect(warnings[0]).toMatchObject({ path: 'items', code: 'not_an_array' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/shape.test.ts`
Expected: FAIL — cannot find module `./shape`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/shape.ts`:
```ts
import { Binding, FieldMapping } from '../mapping-spec'
import { MapperWarning } from '../mapper-warning'
import { applyTransforms } from './apply-transforms'
import { mapperPathUtils } from './path-utils'

type Scope = {
    current: unknown
    rows: unknown[]
}

type EvalBindingParams = {
    binding: Binding
    scope: Scope
    path: string
    warnings: MapperWarning[]
}

type ShapeFieldsParams = {
    fields: FieldMapping[]
    scope: Scope
    basePath: string
    warnings: MapperWarning[]
}

function evalBinding({ binding, scope, path, warnings }: EvalBindingParams): unknown {
    if (binding.kind === 'line_collection') {
        const rows = binding.source
            ? mapperPathUtils.getValueAtPath(scope.current, binding.source)
            : scope.rows
        if (!Array.isArray(rows)) {
            warnings.push({ path, code: 'not_an_array', message: `Expected an array at "${binding.source ?? '<group rows>'}"` })
            return []
        }
        return rows.map((row) =>
            shapeFields({ fields: binding.items, scope: { current: row, rows: [row] }, basePath: path, warnings }),
        )
    }

    const raw = mapperPathUtils.getValueAtPath(scope.current, binding.source)
    if (raw === undefined) {
        warnings.push({ path, code: 'missing_source', message: `Source field "${binding.source}" not found` })
        return applyTransforms({ value: null, transforms: binding.transforms, path, warnings })
    }
    return applyTransforms({ value: raw, transforms: binding.transforms, path, warnings })
}

export function shapeFields({ fields, scope, basePath, warnings }: ShapeFieldsParams): Record<string, unknown> {
    const output: Record<string, unknown> = {}
    for (const field of fields) {
        const path = basePath ? `${basePath}.${field.target}` : field.target
        const value = evalBinding({ binding: field.binding, scope, path, warnings })
        mapperPathUtils.setValueAtPath(output, field.target, value)
    }
    return output
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/shape.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/shape.ts packages/shared/src/lib/mapper/engine/shape.test.ts
git commit -m "feat(mapper): recursive field-shaping core"
```

---

## Task 9: runMapping orchestrator + barrel exports + shared wiring

**Files:**
- Create: `packages/shared/src/lib/mapper/engine/index.ts`
- Create: `packages/shared/src/lib/mapper/engine/run-mapping.test.ts`
- Create: `packages/shared/src/lib/mapper/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (version bump)

- [ ] **Step 1: Write the failing test**

`packages/shared/src/lib/mapper/engine/run-mapping.test.ts`:
```ts
import { MappingSpec } from '../mapping-spec'
import { mapperEngine } from './index'

describe('mapperEngine.runMapping', () => {
  test('reshape: single object → single shaped object', () => {
    const spec: MappingSpec = {
      specVersion: 1, mode: 'auto',
      fields: [{ target: 'name', binding: { kind: 'header', source: 'CustomerName', transforms: [{ id: 'trim' }] } }],
    }
    const { output, warnings } = mapperEngine.runMapping({ sourceData: { CustomerName: ' Acme ' }, spec })
    expect(output).toEqual({ name: 'Acme' })
    expect(warnings).toEqual([])
  })

  test('per_row: array without groupBy → array of shaped objects', () => {
    const spec: MappingSpec = {
      specVersion: 1, mode: 'auto',
      fields: [{ target: 'code', binding: { kind: 'row', source: 'SKU' } }],
    }
    const { output } = mapperEngine.runMapping({ sourceData: [{ SKU: 'A' }, { SKU: 'B' }], spec })
    expect(output).toEqual([{ code: 'A' }, { code: 'B' }])
  })

  test('grouped: Excel rows batched into quotations by CustomerPONumber', () => {
    const spec: MappingSpec = {
      specVersion: 1, mode: 'auto', groupBy: ['CustomerPONumber'],
      fields: [
        { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
        {
          target: 'lines',
          binding: {
            kind: 'line_collection',
            items: [
              { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
              { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
            ],
          },
        },
      ],
    }
    const sourceData = [
      { CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' },
      { CustomerPONumber: 'PO-1', SKU: 'B', Qty: '3' },
      { CustomerPONumber: 'PO-2', SKU: 'C', Qty: '1' },
    ]
    const { output } = mapperEngine.runMapping({ sourceData, spec })
    expect(output).toEqual([
      { po_number: 'PO-1', lines: [{ product_code: 'A', quantity: 2 }, { product_code: 'B', quantity: 3 }] },
      { po_number: 'PO-2', lines: [{ product_code: 'C', quantity: 1 }] },
    ])
  })

  test('grouped: empty source array yields []', () => {
    const spec: MappingSpec = { specVersion: 1, mode: 'auto', groupBy: ['x'], fields: [] }
    expect(mapperEngine.runMapping({ sourceData: [], spec }).output).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/lib/mapper/engine/run-mapping.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/lib/mapper/engine/index.ts`:
```ts
import { MappingSpec } from '../mapping-spec'
import { MapperResult, MapperWarning } from '../mapper-warning'
import { detectMode } from './detect-mode'
import { partitionByKey } from './group'
import { shapeFields } from './shape'

type RunMappingParams = {
    sourceData: unknown
    spec: MappingSpec
}

function runMapping({ sourceData, spec }: RunMappingParams): MapperResult {
    const warnings: MapperWarning[] = []
    const mode = detectMode({ sourceData, spec })

    if (mode === 'reshape') {
        const output = shapeFields({
            fields: spec.fields,
            scope: { current: sourceData, rows: [sourceData] },
            basePath: '',
            warnings,
        })
        return { output, warnings }
    }

    const rows = Array.isArray(sourceData) ? sourceData : []

    if (mode === 'per_row') {
        const output = rows.map((row) =>
            shapeFields({ fields: spec.fields, scope: { current: row, rows: [row] }, basePath: '', warnings }),
        )
        return { output, warnings }
    }

    const groups = partitionByKey({ rows, groupBy: spec.groupBy ?? [] })
    const output = groups.map((group) =>
        shapeFields({ fields: spec.fields, scope: { current: group[0], rows: group }, basePath: '', warnings }),
    )
    return { output, warnings }
}

export const mapperEngine = { runMapping, detectMode }
```

`packages/shared/src/lib/mapper/index.ts`:
```ts
export * from './normalized-schema'
export * from './mapper-warning'
export * from './mapping-spec'
export * from './engine'
export * from './engine/transforms'
```

In `packages/shared/src/index.ts`, add this line in the export block (after the existing `extras` exports, at the end of the domain exports):
```ts
// mapper
export * from './lib/mapper'
```

In `packages/shared/package.json`, bump the version (new exports → minor):
```json
"version": "0.72.0",
```

- [ ] **Step 4: Run the full shared test suite to verify everything passes**

Run: `npx vitest run packages/shared/src/lib/mapper/`
Expected: PASS — all mapper tests (Tasks 1–9) green.

Then verify the barrel re-export resolves:
Run: `npx tsc -p packages/shared/tsconfig.lib.json --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/mapper/engine/index.ts packages/shared/src/lib/mapper/engine/run-mapping.test.ts packages/shared/src/lib/mapper/index.ts packages/shared/src/index.ts packages/shared/package.json
git commit -m "feat(mapper): runMapping orchestrator + shared barrel exports + version bump"
```

---

## Task 10: Scaffold the `@jrnyflw/mapper` piece

**Files:**
- Create: `packages/pieces/custom/mapper/package.json`
- Create: `packages/pieces/custom/mapper/tsconfig.json`
- Create: `packages/pieces/custom/mapper/tsconfig.lib.json`
- Create: `packages/pieces/custom/mapper/.eslintrc.json`
- Create: `packages/pieces/custom/mapper/vitest.config.ts`
- Create: `packages/pieces/custom/mapper/src/index.ts`
- Modify: `tsconfig.base.json` (add path entry)

> **Note:** The piece directory mirrors `packages/pieces/custom/excel/` exactly. Copy its `.eslintrc.json` verbatim (it has no piece-specific content).

- [ ] **Step 1: Create the piece manifest and configs**

`packages/pieces/custom/mapper/package.json`:
```json
{
  "name": "@jrnyflw/mapper",
  "version": "0.0.1",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.lib.json && cp package.json dist/",
    "lint": "eslint 'src/**/*.ts'",
    "test": "vitest run"
  },
  "dependencies": {
    "@activepieces/pieces-common": "workspace:*",
    "@activepieces/pieces-framework": "workspace:*",
    "@activepieces/shared": "workspace:*",
    "tslib": "2.6.2"
  },
  "devDependencies": {
    "vitest": "3.0.8"
  }
}
```

`packages/pieces/custom/mapper/tsconfig.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.lib.json"
    }
  ],
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

`packages/pieces/custom/mapper/tsconfig.lib.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {},
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "types": ["node"]
  },
  "exclude": ["jest.config.ts", "src/**/*.spec.ts", "src/**/*.test.ts"],
  "include": ["src/**/*.ts"]
}
```

`packages/pieces/custom/mapper/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

`packages/pieces/custom/mapper/.eslintrc.json` — copy verbatim from `packages/pieces/custom/excel/.eslintrc.json` (read that file and reproduce it exactly).

- [ ] **Step 2: Create the piece index (no actions yet — Task 11 adds the action)**

`packages/pieces/custom/mapper/src/index.ts`:
```ts
import { PieceAuth, createPiece } from '@activepieces/pieces-framework'
import { PieceCategory } from '@activepieces/shared'
import { applyMapping } from './lib/actions/apply-mapping'

export const mapper = createPiece({
    displayName: 'Mapper',
    description:
        'Reshape one step\'s output into another step\'s input. Map fields, transform values, and batch rows into grouped objects (e.g. Excel line items into quotations) using a declarative mapping spec.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/data-mapper.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.CORE],
    auth: PieceAuth.None(),
    actions: [applyMapping],
    triggers: [],
})
```

- [ ] **Step 3: Register the TS path**

In `tsconfig.base.json`, add to `compilerOptions.paths` (alongside the existing `@jrnyflw/excel` and `@jrnyflw/jrny` entries):
```json
"@jrnyflw/mapper": [
  "packages/pieces/custom/mapper/src/index.ts"
],
```

- [ ] **Step 4: Verify the workspace links resolve**

Run: `npm install`
Expected: completes without error; `@jrnyflw/mapper` symlinked into the workspace.

(The index won't typecheck until Task 11 creates `apply-mapping.ts` — that's expected. Do not run the piece build yet.)

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/mapper/package.json packages/pieces/custom/mapper/tsconfig.json packages/pieces/custom/mapper/tsconfig.lib.json packages/pieces/custom/mapper/.eslintrc.json packages/pieces/custom/mapper/vitest.config.ts packages/pieces/custom/mapper/src/index.ts tsconfig.base.json
git commit -m "feat(mapper): scaffold @jrnyflw/mapper piece"
```

---

## Task 11: `apply_mapping` action + piece unit test

**Files:**
- Create: `packages/pieces/custom/mapper/src/lib/actions/apply-mapping.ts`
- Create: `packages/pieces/custom/mapper/test/apply-mapping.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/pieces/custom/mapper/test/apply-mapping.test.ts`:
```ts
/// <reference types="vitest/globals" />

import { createMockActionContext } from '@activepieces/pieces-framework'
import { applyMapping } from '../src/lib/actions/apply-mapping'

describe('applyMapping action', () => {
  test('groups Excel rows into quotations and returns warnings array', async () => {
    const mappingSpec = {
      specVersion: 1,
      mode: 'auto',
      groupBy: ['CustomerPONumber'],
      fields: [
        { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
        {
          target: 'lines',
          binding: {
            kind: 'line_collection',
            items: [
              { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
              { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
            ],
          },
        },
      ],
    }
    const sourceData = [
      { CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' },
      { CustomerPONumber: 'PO-1', SKU: 'B', Qty: '3' },
      { CustomerPONumber: 'PO-2', SKU: 'C', Qty: '1' },
    ]
    const ctx = createMockActionContext({ propsValue: { sourceData, mappingSpec } })
    const result = await applyMapping.run(ctx)
    expect(result).toEqual({
      output: [
        { po_number: 'PO-1', lines: [{ product_code: 'A', quantity: 2 }, { product_code: 'B', quantity: 3 }] },
        { po_number: 'PO-2', lines: [{ product_code: 'C', quantity: 1 }] },
      ],
      warnings: [],
    })
  })

  test('throws on an invalid mapping spec', async () => {
    const ctx = createMockActionContext({
      propsValue: { sourceData: {}, mappingSpec: { specVersion: 1, fields: [{ target: 'x', binding: { kind: 'bogus' } }] } },
    })
    await expect(applyMapping.run(ctx)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pieces/custom/mapper && npx vitest run test/apply-mapping.test.ts`
Expected: FAIL — cannot find module `../src/lib/actions/apply-mapping`.

- [ ] **Step 3: Write the implementation**

`packages/pieces/custom/mapper/src/lib/actions/apply-mapping.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework'
import { MappingSpecSchema, mapperEngine } from '@activepieces/shared'

export const applyMapping = createAction({
    name: 'apply_mapping',
    displayName: 'Apply Mapping',
    description:
        'Transform the source data into the target shape using a mapping spec. Supports reshape (single object), per-row (array), and grouped (N→1 batching by key) modes.',
    errorHandlingOptions: {
        continueOnFailure: { hide: true },
        retryOnFailure: { hide: true },
    },
    props: {
        sourceData: Property.Json({
            displayName: 'Source Data',
            description: 'The upstream step output to transform. A single object, or an array of rows.',
            required: true,
        }),
        mappingSpec: Property.Json({
            displayName: 'Mapping Spec',
            description: 'The declarative mapping spec (specVersion 1). Authored visually in the mapper UI.',
            required: true,
        }),
    },
    async run(context) {
        const spec = MappingSpecSchema.parse(context.propsValue.mappingSpec)
        return mapperEngine.runMapping({ sourceData: context.propsValue.sourceData, spec })
    },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pieces/custom/mapper && npx vitest run`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the piece builds**

Run: `cd packages/pieces/custom/mapper && npx tsc -p tsconfig.lib.json --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/pieces/custom/mapper/src/lib/actions/apply-mapping.ts packages/pieces/custom/mapper/test/apply-mapping.test.ts
git commit -m "feat(mapper): apply_mapping action wired to the shared engine"
```

---

## Task 12: Full verification & lint

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test-unit`
Expected: PASS — includes all new shared mapper tests.

- [ ] **Step 2: Run the piece tests**

Run: `cd packages/pieces/custom/mapper && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Lint with auto-fix**

Run: `npm run lint-dev`
Expected: no errors. Fix any reported issues (most likely import ordering or the `@activepieces/shared` export-ordering rule — types/consts already placed at end of files per convention).

- [ ] **Step 4: Final commit (if lint made changes)**

```bash
git add -A
git commit -m "chore(mapper): lint fixes"
```

---

## Self-Review (completed during plan authoring)

**Spec coverage (Plan 1 scope):**
- §3 three modes (reshape/per_row/grouped) → Tasks 6, 8, 9 ✓
- §5 mapping spec shape (header/row/line_collection, transforms, groupBy, targetSchema) → Task 2 ✓
- §4 transform registry (10 transforms) → Task 4 ✓
- §6 runtime pipeline (detect → partition → shape → warnings) → Tasks 6–9 ✓
- §8 runtime errors (missing source / transform throws / empty array / non-array) → Tasks 5, 8, 9 tests ✓
- §3 `apply_mapping` action, pure deterministic engine → Tasks 9, 11 ✓
- §9 engine 100% unit coverage, piece integration test → every task is TDD; Task 11 ✓
- §10 CE piece, no edition gating; engine in shared → Tasks 9, 10 ✓
- **Deferred to Plan 2 (correctly out of scope):** §4 schema adapters, §4/§7 all frontend components, bind-lines, preview pane. §6 step 4 output validation against `targetSchema.snapshot` is opt-in/V1.x per spec — not implemented here; the `snapshot` field is carried in the type for Plan 2.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has complete code. ✓

**Type consistency:** `MappingSpec`/`Binding`/`FieldMapping`/`TransformRef` defined in Task 2 and used unchanged in Tasks 5, 6, 8, 9, 11. `MapperWarning`/`MapperResult` from Task 1 used in Tasks 5, 8, 9. `Scope` (`{ current, rows }`) consistent across Tasks 8–9. `mapperEngine.runMapping`, `transformRegistry`, `mapperPathUtils`, `applyTransforms`, `detectMode`, `partitionByKey`, `shapeFields` — names identical at definition and call sites. ✓

---

## Plan 2 preview (not part of this plan)

Once these types are merged, **Plan 2 — Visual Mapper Canvas** covers: schema adapters (`json_sample`, `json_schema`, `xml`, `html_table`, `csv`, `xlsx`, `piece_schema`, `openapi`) producing `NormalizedSchema`; the custom step-settings panel (`MapperStepConfig`) that renders for the `@jrnyflw/mapper` piece instead of the auto-form; `SchemaAttachBar`, `MappingCanvas`, `BindLineOverlay` (SVG Bezier), `SourceTree` (reusing `DataSelectorTreeNode` + V0 `react-dnd` machinery), `TargetSlotList`, `TransformPicker`, and the in-browser `PreviewPane` (importing `mapperEngine.runMapping` from `@activepieces/shared`). i18n keys for all UI copy + transform `labelKey`s land there.
