# Visual Mapper — Schema Adapters Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build pure, browser-side schema adapters that parse a raw sample (JSON, JSON Schema, XML, HTML table, CSV, OpenAPI request body) into the shared `NormalizedSchema` tree, so the visual mapper UI (Plan 3) can render target/source slots from any of these formats.

**Architecture:** Each adapter is a pure function `parse({ raw, ref? }) → NormalizedSchema` that throws a descriptive `Error` on bad input. Format-specific parsing produces an intermediate JS value or JSON-Schema object, then two shared converters (`inferSchemaFromSample` for value-based formats, `jsonSchemaConverter` for schema-based formats) produce the `NormalizedSchema`. All adapters are aggregated into a `schemaAdapters` registry keyed by id. Lives in the web package (`packages/web/src/app/builder/step-settings/mapper/schema-adapters/`) — design-time/browser-only, imports only the `NormalizedSchema` type from `@activepieces/shared`.

**Tech Stack:** TypeScript, Vitest (web package, `// @vitest-environment jsdom`), papaparse (CSV, already in web), fast-xml-parser (XML, added to web in Task 5), native `DOMParser` (HTML), native JSON.

**Spec:** `docs/superpowers/specs/2026-05-22-visual-mapper-v1-design.md` §4 (Schema adapters table).

**Out of scope (deferred):** `xlsx` adapter (needs heavy `exceljs` in web; upstream `@jrnyflw/excel` already emits JSON — revisit if a real need appears). `piece_schema` adapter (converts live `PieceMetadataModel`, not pasted text — belongs to Plan 3 where piece metadata is in scope). Output-validation against `targetSchema.snapshot` (Plan 1 §6 step 4, opt-in, deferred).

---

## Shared contract (from `@activepieces/shared`, do not redefine)

```ts
type NormalizedFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'unknown'
type NormalizedField = { name: string; type: NormalizedFieldType; children?: NormalizedField[] }
type NormalizedSchema = { root: 'object' | 'array'; fields: NormalizedField[] }
```

`children` semantics: present when `type` is `object` (the object's fields) or `array` (the array element's fields, when the element is an object). Absent for scalar types and for arrays of scalars.

The web vitest config aliases `@activepieces/shared` → `packages/shared/src`, so importing the type works in tests without building shared.

---

## File Structure

| File | Responsibility |
|---|---|
| `…/mapper/schema-adapters/adapter-type.ts` | `SchemaAdapter`, `SchemaAdapterId`, `SchemaAdapterInput` types |
| `…/mapper/schema-adapters/infer-schema.ts` | `inferSchemaUtils.inferSchemaFromSample(value)` + `inferType` (value → NormalizedSchema) |
| `…/mapper/schema-adapters/json-schema-converter.ts` | `jsonSchemaConverter.convert(schema)` + `$ref` resolver (JSON-Schema-like → NormalizedSchema) |
| `…/mapper/schema-adapters/json-sample-adapter.ts` | `jsonSampleAdapter` |
| `…/mapper/schema-adapters/json-schema-adapter.ts` | `jsonSchemaAdapter` |
| `…/mapper/schema-adapters/csv-adapter.ts` | `csvAdapter` (papaparse) |
| `…/mapper/schema-adapters/xml-adapter.ts` | `xmlAdapter` (fast-xml-parser) |
| `…/mapper/schema-adapters/html-table-adapter.ts` | `htmlTableAdapter` (DOMParser) |
| `…/mapper/schema-adapters/openapi-adapter.ts` | `openapiAdapter` (ref → request body schema → convert) |
| `…/mapper/schema-adapters/index.ts` | `schemaAdapters` registry + re-exports |
| `packages/web/package.json` | add `fast-xml-parser` dependency (Task 5) |

> **CORRECTION (test location):** Per `packages/web/CLAUDE.md`, tests live under **`packages/web/test/`** mirroring the source path — **never** colocated under `src/`. So a source file at `src/app/builder/step-settings/mapper/schema-adapters/foo.ts` has its test at `test/app/builder/step-settings/mapper/schema-adapters/foo.test.ts`, and the test imports the subject via the **`@/` alias** (`import { x } from '@/app/builder/step-settings/mapper/schema-adapters/foo'`), not a relative path. The code blocks below show relative imports for brevity — convert every test import to the `@/` alias and place every test file under `packages/web/test/...`. Each test file's first line is `// @vitest-environment jsdom`. Run from `packages/web`: `npm test -- test/app/builder/step-settings/mapper/schema-adapters/<file>.test.ts` (script is `vitest run --passWithNoTests`).

Source base path = `packages/web/src/app/builder/step-settings/mapper/schema-adapters/`. Test base path = `packages/web/test/app/builder/step-settings/mapper/schema-adapters/`.

> **CORRECTION (formatting):** The **web** package uses Prettier defaults — **2-space indentation, semicolons, single quotes** (root `.prettierrc` = `{"singleQuote": true}`). The code blocks below show 4-space/no-semicolon (shared-package style) — write web files in 2-space + semicolons instead. Either way, Task 8's `npm run lint-dev --fix` normalizes formatting across all adapter files; do not hand-fight Prettier.

---

## Task 1: `inferSchemaFromSample` — value → NormalizedSchema

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/infer-schema.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/infer-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`infer-schema.test.ts`:
```ts
// @vitest-environment jsdom
import { inferSchemaUtils } from './infer-schema'

const { inferSchemaFromSample } = inferSchemaUtils

describe('inferSchemaFromSample', () => {
    test('infers a flat object', () => {
        expect(inferSchemaFromSample({ name: 'Acme', age: 5, active: true })).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'age', type: 'number' },
                { name: 'active', type: 'boolean' },
            ],
        })
    })

    test('infers nested objects with children', () => {
        expect(inferSchemaFromSample({ customer: { name: 'Acme' } })).toEqual({
            root: 'object',
            fields: [
                { name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] },
            ],
        })
    })

    test('infers an array root from the first element', () => {
        expect(inferSchemaFromSample([{ sku: 'A', qty: 2 }, { sku: 'B', qty: 3 }])).toEqual({
            root: 'array',
            fields: [
                { name: 'sku', type: 'string' },
                { name: 'qty', type: 'number' },
            ],
        })
    })

    test('infers array-of-objects field with element children', () => {
        expect(inferSchemaFromSample({ lines: [{ sku: 'A' }] })).toEqual({
            root: 'object',
            fields: [
                { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
            ],
        })
    })

    test('array of scalars has no children', () => {
        expect(inferSchemaFromSample({ tags: ['a', 'b'] })).toEqual({
            root: 'object',
            fields: [{ name: 'tags', type: 'array' }],
        })
    })

    test('null and empty array yield null / array with no children', () => {
        expect(inferSchemaFromSample({ a: null, b: [] })).toEqual({
            root: 'object',
            fields: [
                { name: 'a', type: 'null' },
                { name: 'b', type: 'array' },
            ],
        })
    })

    test('empty array root yields array with no fields', () => {
        expect(inferSchemaFromSample([])).toEqual({ root: 'array', fields: [] })
    })

    test('throws on a scalar input', () => {
        expect(() => inferSchemaFromSample('hello')).toThrow()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/infer-schema.test.ts`
Expected: FAIL — cannot find module `./infer-schema`.

- [ ] **Step 3: Write the implementation**

`infer-schema.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/infer-schema.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/infer-schema.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/infer-schema.test.ts
git commit -m "feat(mapper-ui): infer NormalizedSchema from a sample value" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `jsonSchemaConverter` — JSON Schema → NormalizedSchema

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.test.ts`

- [ ] **Step 1: Write the failing test**

`json-schema-converter.test.ts`:
```ts
// @vitest-environment jsdom
import { jsonSchemaConverter } from './json-schema-converter'

const convert = (schema: unknown, root?: unknown) => jsonSchemaConverter.convert({ schema, root })

describe('jsonSchemaConverter.convert', () => {
    test('converts an object schema with typed properties', () => {
        const schema = {
            type: 'object',
            properties: { name: { type: 'string' }, age: { type: 'integer' } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'age', type: 'number' },
            ],
        })
    })

    test('converts nested object properties into children', () => {
        const schema = {
            type: 'object',
            properties: { customer: { type: 'object', properties: { name: { type: 'string' } } } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [{ name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] }],
        })
    })

    test('converts an array property whose items are objects', () => {
        const schema = {
            type: 'object',
            properties: { lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } } },
        }
        expect(convert(schema)).toEqual({
            root: 'object',
            fields: [{ name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] }],
        })
    })

    test('converts an array-root schema', () => {
        const schema = { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } }
        expect(convert(schema)).toEqual({ root: 'array', fields: [{ name: 'sku', type: 'string' }] })
    })

    test('resolves a local $ref against the provided root document', () => {
        const root = {
            components: { schemas: { Line: { type: 'object', properties: { sku: { type: 'string' } } } } },
        }
        const schema = { type: 'array', items: { $ref: '#/components/schemas/Line' } }
        expect(convert(schema, root)).toEqual({ root: 'array', fields: [{ name: 'sku', type: 'string' }] })
    })

    test('maps unknown/missing types to unknown', () => {
        const schema = { type: 'object', properties: { x: {} } }
        expect(convert(schema)).toEqual({ root: 'object', fields: [{ name: 'x', type: 'unknown' }] })
    })

    test('throws when the root schema is neither object nor array', () => {
        expect(() => convert({ type: 'string' })).toThrow()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.test.ts`
Expected: FAIL — cannot find module `./json-schema-converter`.

- [ ] **Step 3: Write the implementation**

`json-schema-converter.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-converter.test.ts
git commit -m "feat(mapper-ui): JSON Schema to NormalizedSchema converter with \$ref" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Adapter type + JSON sample adapter

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/adapter-type.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

`json-sample-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { jsonSampleAdapter } from './json-sample-adapter'

describe('jsonSampleAdapter', () => {
    test('has id json_sample', () => {
        expect(jsonSampleAdapter.id).toBe('json_sample')
    })

    test('parses a JSON object string into a NormalizedSchema', () => {
        expect(jsonSampleAdapter.parse({ raw: '{"name":"Acme","lines":[{"sku":"A"}]}' })).toEqual({
            root: 'object',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
            ],
        })
    })

    test('throws a descriptive error on invalid JSON', () => {
        expect(() => jsonSampleAdapter.parse({ raw: 'not json' })).toThrow(/JSON/i)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.test.ts`
Expected: FAIL — cannot find module `./json-sample-adapter`.

- [ ] **Step 3: Write the implementation**

`adapter-type.ts`:
```ts
import { NormalizedSchema } from '@activepieces/shared'

export type SchemaAdapterId =
    | 'json_sample'
    | 'json_schema'
    | 'csv'
    | 'xml'
    | 'html_table'
    | 'openapi'

export type SchemaAdapterInput = {
    raw: string
    ref?: string
}

export type SchemaAdapter = {
    id: SchemaAdapterId
    parse: (input: SchemaAdapterInput) => NormalizedSchema
}
```

`json-sample-adapter.ts`:
```ts
import { SchemaAdapter } from './adapter-type'
import { inferSchemaUtils } from './infer-schema'

export const jsonSampleAdapter: SchemaAdapter = {
    id: 'json_sample',
    parse: ({ raw }) => {
        let value: unknown
        try {
            value = JSON.parse(raw)
        }
        catch {
            throw new Error('Invalid JSON sample')
        }
        return inferSchemaUtils.inferSchemaFromSample(value)
    },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/adapter-type.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-sample-adapter.test.ts
git commit -m "feat(mapper-ui): adapter type + JSON sample adapter" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: JSON Schema adapter

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

`json-schema-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { jsonSchemaAdapter } from './json-schema-adapter'

describe('jsonSchemaAdapter', () => {
    test('has id json_schema', () => {
        expect(jsonSchemaAdapter.id).toBe('json_schema')
    })

    test('parses a JSON Schema string into a NormalizedSchema', () => {
        const raw = JSON.stringify({ type: 'object', properties: { name: { type: 'string' } } })
        expect(jsonSchemaAdapter.parse({ raw })).toEqual({
            root: 'object',
            fields: [{ name: 'name', type: 'string' }],
        })
    })

    test('throws on invalid JSON', () => {
        expect(() => jsonSchemaAdapter.parse({ raw: '{bad' })).toThrow(/JSON/i)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.test.ts`
Expected: FAIL — cannot find module `./json-schema-adapter`.

- [ ] **Step 3: Write the implementation**

`json-schema-adapter.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/json-schema-adapter.test.ts
git commit -m "feat(mapper-ui): JSON Schema adapter" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: CSV adapter (papaparse) + XML adapter (fast-xml-parser)

**Files:**
- Modify: `packages/web/package.json` (add `fast-xml-parser`)
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.test.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.test.ts`

- [ ] **Step 1: Add the fast-xml-parser dependency**

In `packages/web/package.json`, add to `dependencies` (keep alphabetical placement near other `f…` deps; use the version already used elsewhere in the repo):
```json
"fast-xml-parser": "5.5.6",
```
Then install (repo uses Bun): `bun install`. Confirm it resolves.

- [ ] **Step 2: Write the failing tests**

`csv-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { csvAdapter } from './csv-adapter'

describe('csvAdapter', () => {
    test('has id csv', () => {
        expect(csvAdapter.id).toBe('csv')
    })

    test('parses a CSV with a header row into an array schema', () => {
        const raw = 'sku,qty\nA,2\nB,3'
        expect(csvAdapter.parse({ raw })).toEqual({
            root: 'array',
            fields: [
                { name: 'sku', type: 'string' },
                { name: 'qty', type: 'string' },
            ],
        })
    })

    test('throws on empty input', () => {
        expect(() => csvAdapter.parse({ raw: '' })).toThrow(/CSV/i)
    })
})
```

`xml-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { xmlAdapter } from './xml-adapter'

describe('xmlAdapter', () => {
    test('has id xml', () => {
        expect(xmlAdapter.id).toBe('xml')
    })

    test('parses an XML fragment into a NormalizedSchema', () => {
        const raw = '<order><customer>Acme</customer><total>100</total></order>'
        expect(xmlAdapter.parse({ raw })).toEqual({
            root: 'object',
            fields: [
                { name: 'customer', type: 'string' },
                { name: 'total', type: 'number' },
            ],
        })
    })

    test('throws on invalid XML', () => {
        expect(() => xmlAdapter.parse({ raw: '<a><b>' })).toThrow(/XML/i)
    })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.test.ts src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the implementations**

`csv-adapter.ts`:
```ts
import Papa from 'papaparse'

import { SchemaAdapter } from './adapter-type'
import { inferSchemaUtils } from './infer-schema'

export const csvAdapter: SchemaAdapter = {
    id: 'csv',
    parse: ({ raw }) => {
        if (raw.trim() === '') {
            throw new Error('CSV input is empty')
        }
        const result = Papa.parse<Record<string, unknown>>(raw, {
            header: true,
            skipEmptyLines: true,
        })
        if (result.data.length === 0) {
            throw new Error('CSV has no data rows')
        }
        return inferSchemaUtils.inferSchemaFromSample(result.data)
    },
}
```

`xml-adapter.ts`:
```ts
import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { SchemaAdapter } from './adapter-type'
import { inferSchemaUtils } from './infer-schema'

export const xmlAdapter: SchemaAdapter = {
    id: 'xml',
    parse: ({ raw }) => {
        const validation = XMLValidator.validate(raw)
        if (validation !== true) {
            throw new Error('Invalid XML input')
        }
        const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true })
        const parsed = parser.parse(raw)
        const rootKeys = Object.keys(parsed)
        const inner = rootKeys.length === 1 ? parsed[rootKeys[0]] : parsed
        return inferSchemaUtils.inferSchemaFromSample(inner)
    },
}
```

> Note: `parseTagValue: true` makes `<total>100</total>` infer as `number`, matching the test. The single-root-element unwrap (`inner`) drops the XML document's outer element so the schema reflects the record fields.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.test.ts src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json bun.lock packages/web/src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/csv-adapter.test.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/xml-adapter.test.ts
git commit -m "feat(mapper-ui): CSV and XML adapters" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: HTML table adapter (DOMParser)

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

`html-table-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { htmlTableAdapter } from './html-table-adapter'

describe('htmlTableAdapter', () => {
    test('has id html_table', () => {
        expect(htmlTableAdapter.id).toBe('html_table')
    })

    test('parses thead headers into an array schema of string fields', () => {
        const raw = '<table><thead><tr><th>SKU</th><th>Qty</th></tr></thead><tbody><tr><td>A</td><td>2</td></tr></tbody></table>'
        expect(htmlTableAdapter.parse({ raw })).toEqual({
            root: 'array',
            fields: [
                { name: 'SKU', type: 'string' },
                { name: 'Qty', type: 'string' },
            ],
        })
    })

    test('falls back to first row cells when there is no thead', () => {
        const raw = '<table><tr><th>Name</th><th>Email</th></tr><tr><td>Acme</td><td>a@b.c</td></tr></table>'
        expect(htmlTableAdapter.parse({ raw })).toEqual({
            root: 'array',
            fields: [
                { name: 'Name', type: 'string' },
                { name: 'Email', type: 'string' },
            ],
        })
    })

    test('throws when no table is present', () => {
        expect(() => htmlTableAdapter.parse({ raw: '<div>no table</div>' })).toThrow(/table/i)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.test.ts`
Expected: FAIL — cannot find module `./html-table-adapter`.

- [ ] **Step 3: Write the implementation**

`html-table-adapter.ts`:
```ts
import { NormalizedSchema } from '@activepieces/shared'

import { SchemaAdapter } from './adapter-type'

function extractHeaders(table: HTMLTableElement): string[] {
    const headerCells = table.querySelectorAll('thead th')
    if (headerCells.length > 0) {
        return Array.from(headerCells).map((cell) => cell.textContent?.trim() ?? '')
    }
    const firstRow = table.querySelector('tr')
    if (!firstRow) return []
    return Array.from(firstRow.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() ?? '')
}

export const htmlTableAdapter: SchemaAdapter = {
    id: 'html_table',
    parse: ({ raw }) => {
        const doc = new DOMParser().parseFromString(raw, 'text/html')
        const table = doc.querySelector('table')
        if (!table) {
            throw new Error('No <table> element found in HTML input')
        }
        const headers = extractHeaders(table).filter((name) => name.length > 0)
        if (headers.length === 0) {
            throw new Error('Table has no header cells')
        }
        const schema: NormalizedSchema = {
            root: 'array',
            fields: headers.map((name) => ({ name, type: 'string' })),
        }
        return schema
    },
}
```

> Note: HTML cell values are always text, so every field is typed `string`. The downstream mapper can attach `parse_number` transforms where needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/html-table-adapter.test.ts
git commit -m "feat(mapper-ui): HTML table adapter" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: OpenAPI adapter

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.test.ts`

The `ref` selects the operation: format `"<METHOD> <path>"`, e.g. `"POST /quotations"`. The adapter extracts that operation's JSON request-body schema and converts it via `jsonSchemaConverter` (passing the whole spec as the `$ref` resolution root).

- [ ] **Step 1: Write the failing test**

`openapi-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { openapiAdapter } from './openapi-adapter'

const spec = JSON.stringify({
    openapi: '3.0.0',
    paths: {
        '/quotations': {
            post: {
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    po_number: { type: 'string' },
                                    lines: { type: 'array', items: { $ref: '#/components/schemas/Line' } },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: { schemas: { Line: { type: 'object', properties: { sku: { type: 'string' } } } } },
})

describe('openapiAdapter', () => {
    test('has id openapi', () => {
        expect(openapiAdapter.id).toBe('openapi')
    })

    test('extracts and converts the request body schema for an operation', () => {
        expect(openapiAdapter.parse({ raw: spec, ref: 'POST /quotations' })).toEqual({
            root: 'object',
            fields: [
                { name: 'po_number', type: 'string' },
                { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
            ],
        })
    })

    test('is case-insensitive on the method', () => {
        expect(openapiAdapter.parse({ raw: spec, ref: 'post /quotations' }).root).toBe('object')
    })

    test('throws when ref is missing', () => {
        expect(() => openapiAdapter.parse({ raw: spec })).toThrow(/operation/i)
    })

    test('throws when the operation is not found', () => {
        expect(() => openapiAdapter.parse({ raw: spec, ref: 'GET /nope' })).toThrow(/not found/i)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.test.ts`
Expected: FAIL — cannot find module `./openapi-adapter`.

- [ ] **Step 3: Write the implementation**

`openapi-adapter.ts`:
```ts
import { SchemaAdapter } from './adapter-type'
import { jsonSchemaConverter } from './json-schema-converter'

type JsonNode = Record<string, unknown>

function isObjectNode(value: unknown): value is JsonNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRequestBodySchema(spec: JsonNode, method: string, path: string): unknown {
    const paths = spec['paths']
    if (!isObjectNode(paths)) throw new Error('OpenAPI spec has no paths')
    const pathItem = paths[path]
    if (!isObjectNode(pathItem)) throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`)
    const operation = pathItem[method]
    if (!isObjectNode(operation)) throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`)
    const requestBody = operation['requestBody']
    if (!isObjectNode(requestBody)) throw new Error(`Operation has no request body: ${method.toUpperCase()} ${path}`)
    const content = requestBody['content']
    if (!isObjectNode(content)) throw new Error('Request body has no content')
    const json = content['application/json']
    if (!isObjectNode(json)) throw new Error('Request body has no application/json content')
    return json['schema']
}

export const openapiAdapter: SchemaAdapter = {
    id: 'openapi',
    parse: ({ raw, ref }) => {
        if (!ref || ref.trim() === '') {
            throw new Error('OpenAPI adapter requires an operation ref like "POST /quotations"')
        }
        let spec: unknown
        try {
            spec = JSON.parse(raw)
        }
        catch {
            throw new Error('Invalid OpenAPI document')
        }
        if (!isObjectNode(spec)) {
            throw new Error('Invalid OpenAPI document')
        }
        const [rawMethod, ...rest] = ref.trim().split(/\s+/)
        const path = rest.join(' ')
        if (!rawMethod || path === '') {
            throw new Error('Operation ref must be "<METHOD> <path>"')
        }
        const schema = getRequestBodySchema(spec, rawMethod.toLowerCase(), path)
        return jsonSchemaConverter.convert({ schema, root: spec })
    },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/openapi-adapter.test.ts
git commit -m "feat(mapper-ui): OpenAPI request-body adapter" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Adapter registry + barrel + verification

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/index.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/index.test.ts`

- [ ] **Step 1: Write the failing test**

`index.test.ts`:
```ts
// @vitest-environment jsdom
import { schemaAdapters, runSchemaAdapter } from './index'

describe('schemaAdapters registry', () => {
    test('registers all six adapters by id', () => {
        expect(Object.keys(schemaAdapters).sort()).toEqual(
            ['csv', 'html_table', 'json_sample', 'json_schema', 'openapi', 'xml'].sort(),
        )
    })

    test('runSchemaAdapter dispatches by id', () => {
        const schema = runSchemaAdapter({ id: 'json_sample', raw: '{"a":1}' })
        expect(schema).toEqual({ root: 'object', fields: [{ name: 'a', type: 'number' }] })
    })

    test('runSchemaAdapter forwards ref to the openapi adapter', () => {
        const raw = JSON.stringify({
            paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } } } } } } } } },
        })
        expect(runSchemaAdapter({ id: 'openapi', raw, ref: 'POST /x' })).toEqual({
            root: 'object',
            fields: [{ name: 'a', type: 'string' }],
        })
    })

    test('runSchemaAdapter throws on an unknown id', () => {
        // @ts-expect-error testing the runtime guard with an invalid id
        expect(() => runSchemaAdapter({ id: 'nope', raw: '{}' })).toThrow(/adapter/i)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/index.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

`index.ts`:
```ts
import { NormalizedSchema } from '@activepieces/shared'

import { SchemaAdapter, SchemaAdapterId, SchemaAdapterInput } from './adapter-type'
import { csvAdapter } from './csv-adapter'
import { htmlTableAdapter } from './html-table-adapter'
import { jsonSampleAdapter } from './json-sample-adapter'
import { jsonSchemaAdapter } from './json-schema-adapter'
import { openapiAdapter } from './openapi-adapter'
import { xmlAdapter } from './xml-adapter'

type RunSchemaAdapterParams = SchemaAdapterInput & {
    id: SchemaAdapterId
}

function runSchemaAdapter({ id, raw, ref }: RunSchemaAdapterParams): NormalizedSchema {
    const adapter = schemaAdapters[id]
    if (!adapter) {
        throw new Error(`Unknown schema adapter: ${id}`)
    }
    return adapter.parse({ raw, ref })
}

export const schemaAdapters: Record<SchemaAdapterId, SchemaAdapter> = {
    json_sample: jsonSampleAdapter,
    json_schema: jsonSchemaAdapter,
    csv: csvAdapter,
    xml: xmlAdapter,
    html_table: htmlTableAdapter,
    openapi: openapiAdapter,
}

export const schemaAdapterRunner = { runSchemaAdapter }
export { runSchemaAdapter }
export type { SchemaAdapter, SchemaAdapterId, SchemaAdapterInput } from './adapter-type'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full adapters suite + typecheck + lint**

Run: `cd packages/web && npm test -- src/app/builder/step-settings/mapper/schema-adapters/`
Expected: all adapter tests pass.

Run: `npm run lint-dev` (auto-fix). Confirm changes are confined to the new adapter files; fix any genuine lint errors in our files; do not touch unrelated pre-existing issues. Re-run the adapters suite if lint changed files.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters/index.ts packages/web/src/app/builder/step-settings/mapper/schema-adapters/index.test.ts
git commit -m "feat(mapper-ui): schema adapter registry + runner" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review (completed during plan authoring)

**Spec coverage (§4 adapters):** json_sample (T3), json_schema (T2+T4), csv (T5), xml (T5), html_table (T6), openapi (T7), registry (T8) ✓. `piece_schema` and `xlsx` explicitly deferred (see Out of scope) — `piece_schema` to Plan 3, `xlsx` indefinitely. All adapters output the shared `NormalizedSchema` ✓.

**Placeholder scan:** every code step has complete code; no TBD/"handle errors" placeholders. ✓

**Type consistency:** `SchemaAdapter`/`SchemaAdapterId`/`SchemaAdapterInput` defined in T3, used unchanged in T4-T8. `inferSchemaUtils.inferSchemaFromSample` (T1) used by T3/T5. `jsonSchemaConverter.convert({ schema, root })` (T2) used by T4/T7 with the same param shape. `schemaAdapters` / `runSchemaAdapter` names consistent T8. `NormalizedSchema`/`NormalizedField`/`NormalizedFieldType` imported from shared throughout. ✓

---

## Plan 3 preview (not part of this plan)

Plan 3 — Visual Canvas UI — consumes `schemaAdapters`/`runSchemaAdapter` (this plan) and `mapperEngine.runMapping` (Plan 1) to build: the `MapperStepConfig` panel (mounted from `piece-settings/index.tsx` when `pieceModel.name === '@jrnyflw/mapper'`), `SchemaAttachBar`, `SourceTree` (from `outputSampleData` + `dataSelectorUtils.traverseStep`, reusing `dnd-types.ts`), `TargetSlotList` + `useDrop` slots, `BindLineOverlay` (SVG Bezier), `TransformPicker`, and the in-browser `PreviewPane`. It also adds the `piece_schema` adapter (live `PieceMetadataModel` → NormalizedSchema) and all i18n keys.
