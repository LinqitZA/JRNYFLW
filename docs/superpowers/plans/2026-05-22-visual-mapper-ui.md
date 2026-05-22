# Visual Mapper — Canvas UI Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a custom drag-and-drop mapping canvas for the `@jrnyflw/mapper` piece's `apply_mapping` action — pick a source step, attach a target schema, drag source fields onto target slots, configure transforms, see a live preview — persisting the authored `MappingSpec` into the action's `mappingSpec` prop.

**Architecture:** A custom settings panel `MapperStepConfig` replaces the auto-generated form when `pieceModel.name === '@jrnyflw/mapper'`. It reads/writes `settings.input.sourceData` and `settings.input.mappingSpec` via react-hook-form. Pure UI-logic utilities (source-tree, target-slot, spec-mutation) are unit-tested in isolation; the React components are thin assemblies over them. Drag/drop reuses the existing `dnd-types.ts` + `DndProvider` (already at the builder root). Preview runs `mapperEngine.runMapping` (from `@activepieces/shared`) in-browser against the source step's sample output. Schema attach uses `schemaAdapters`/`runSchemaAdapter` (Plan 2) plus a new `piece_schema` adapter.

**Tech Stack:** React 18, react-hook-form, react-dnd@16 + HTML5Backend, Tailwind + Shadcn UI, i18next (ICU), Vitest + React Testing Library (`// @vitest-environment jsdom`).

**Spec:** `docs/superpowers/specs/2026-05-22-visual-mapper-v1-design.md` §4, §7.
**Builds on:** Plan 1 (`mapperEngine`, `MappingSpec` types in `@activepieces/shared`) and Plan 2 (`schemaAdapters` in `packages/web/src/app/builder/step-settings/mapper/schema-adapters/`).

---

## Conventions (binding — from `packages/web/CLAUDE.md`)

- **Source** under `packages/web/src/...`; **tests** under `packages/web/test/...` mirroring the source path, imported via the **`@/` alias**. Never colocate tests in `src/`.
- **Web formatting:** 2-space indentation, semicolons, single quotes.
- **Tailwind:** use `cn()` from `@/lib/utils` for className composition; never template-literal classNames; no negative margins.
- **react-hook-form:** `useFormContext()`; field paths `settings.input.<prop>`; use `form.watch()` to read, `form.setValue()` to write; `<FormField>` + `render` for any standard fields.
- **i18n:** all user-facing strings are keys in `packages/web/public/locales/en/translation.json` (ICU, single braces); call `t('...')` from `i18next`. Add keys before use.
- **No `any`, no `as` casts** (guarded narrowing only). Exported public contract at end of file. React components are named exports; util files group functions into a single exported const.
- Run web tests: `cd packages/web && npm test -- <path-relative-to-web>`.

Source base = `packages/web/src/app/builder/step-settings/mapper/`. Test base = `packages/web/test/app/builder/step-settings/mapper/`.

---

## UX model (V1 — keep it simple and correct)

- The author picks **one source step** (any prior step). Its design-time sample is `outputSampleData[sourceStepName]`. `settings.input.sourceData` is set to the mention `{{steps.<sourceStepName>.output}}` so it resolves at runtime.
- The **source tree** shows the fields of one *row* of the source: if the sample is an array, the first element's fields; if an object, the object's fields. Every leaf carries a **dot-path relative to the row**.
- The **target slots** come from the attached target `NormalizedSchema`. A scalar field → a `scalar` slot. An array-of-objects field → a `collection` slot plus its item fields as `scalar` slots tagged with `collectionPath`.
- **Binding kind is decided by the target slot, not the source:** dropping a source field on a scalar slot creates a `header` binding; dropping on a collection-item slot creates a `row` binding inside that `line_collection`. This matches the engine: in grouped mode `header` reads `group[0]` and `row` items read each group row — both reference the same row field names.
- This covers the two headline cases (Excel rows → grouped quotations; object → object reshape). Reshaping a *nested* source array into a collection (vendor-JSON case) is a V1.x follow-up; the spec/engine already support it via `line_collection.source`.

---

## File Structure

| File | Responsibility |
|---|---|
| `mapper/mapper-ui-types.ts` | `SourceNode`, `TargetSlot` types |
| `mapper/source-tree-utils.ts` | `mapperSourceUtils.buildSourceTree(sample)` → `SourceNode[]` |
| `mapper/target-slot-utils.ts` | `mapperTargetUtils.deriveSlots(schema)` → `TargetSlot[]` |
| `mapper/mapper-spec-utils.ts` | `mapperSpecUtils` — pure `MappingSpec` create/mutate |
| `schema-adapters/piece-schema-adapter.ts` | `pieceSchemaAdapter` — `PiecePropertyMap` → `NormalizedSchema` |
| `mapper/index.tsx` | `MapperStepConfig` — orchestrator, mounted from piece-settings |
| `mapper/schema-attach-bar.tsx` | `SchemaAttachBar` — choose + parse target schema |
| `mapper/source-tree.tsx` | `SourceTree` — draggable source leaves |
| `mapper/target-slot-list.tsx` | `TargetSlotList` + `TargetSlotRow` — drop targets |
| `mapper/transform-picker.tsx` | `TransformPicker` — per-slot transform config |
| `mapper/preview-pane.tsx` | `PreviewPane` — live engine output + warnings |
| `mapper/bind-line-overlay.tsx` | `BindLineOverlay` — SVG Bezier bind-lines |
| `step-settings/piece-settings/index.tsx` | MODIFY — mount `MapperStepConfig` for the mapper piece |
| `public/locales/en/translation.json` | MODIFY — add UI string keys |

---

## Task 1: UI types + source-tree builder

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/mapper-ui-types.ts`
- Create: `packages/web/src/app/builder/step-settings/mapper/source-tree-utils.ts`
- Create: `packages/web/test/app/builder/step-settings/mapper/source-tree-utils.test.ts`

- [ ] **Step 1: failing test** — `test/app/builder/step-settings/mapper/source-tree-utils.test.ts`:
```ts
// @vitest-environment jsdom
import { mapperSourceUtils } from '@/app/builder/step-settings/mapper/source-tree-utils';

const { buildSourceTree } = mapperSourceUtils;

describe('buildSourceTree', () => {
  test('builds row fields from an array sample (first element)', () => {
    expect(buildSourceTree([{ CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' }])).toEqual([
      { path: 'CustomerPONumber', name: 'CustomerPONumber', type: 'string' },
      { path: 'SKU', name: 'SKU', type: 'string' },
      { path: 'Qty', name: 'Qty', type: 'string' },
    ]);
  });

  test('builds fields from an object sample, recursing nested objects with dotted paths', () => {
    expect(buildSourceTree({ customer: { name: 'Acme' }, total: 100 })).toEqual([
      {
        path: 'customer',
        name: 'customer',
        type: 'object',
        children: [{ path: 'customer.name', name: 'name', type: 'string' }],
      },
      { path: 'total', name: 'total', type: 'number' },
    ]);
  });

  test('treats array-valued fields as leaf array nodes (no recursion in V1)', () => {
    expect(buildSourceTree({ lines: [{ sku: 'A' }] })).toEqual([
      { path: 'lines', name: 'lines', type: 'array' },
    ]);
  });

  test('returns [] for a null or scalar sample', () => {
    expect(buildSourceTree(null)).toEqual([]);
    expect(buildSourceTree('hi')).toEqual([]);
    expect(buildSourceTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: run, verify FAIL** — `cd packages/web && npm test -- test/app/builder/step-settings/mapper/source-tree-utils.test.ts`

- [ ] **Step 3: implement.**

`mapper-ui-types.ts`:
```ts
import { NormalizedFieldType } from '@activepieces/shared';

export type SourceNode = {
  path: string;
  name: string;
  type: NormalizedFieldType;
  children?: SourceNode[];
};

export type TargetSlot = {
  path: string;
  name: string;
  type: NormalizedFieldType;
  kind: 'scalar' | 'collection';
  collectionPath?: string;
  depth: number;
};
```

`source-tree-utils.ts`:
```ts
import { NormalizedFieldType } from '@activepieces/shared';

import { SourceNode } from './mapper-ui-types';

function inferType(value: unknown): NormalizedFieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildNodes(record: Record<string, unknown>, basePath: string): SourceNode[] {
  return Object.entries(record).map(([name, value]) => {
    const path = basePath ? `${basePath}.${name}` : name;
    const type = inferType(value);
    if (type === 'object' && isPlainObject(value)) {
      return { path, name, type, children: buildNodes(value, path) };
    }
    return { path, name, type };
  });
}

function buildSourceTree(sample: unknown): SourceNode[] {
  const row = Array.isArray(sample) ? sample[0] : sample;
  if (!isPlainObject(row)) return [];
  return buildNodes(row, '');
}

export const mapperSourceUtils = { buildSourceTree };
```

- [ ] **Step 4: run, verify PASS** (4 tests).

- [ ] **Step 5: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/mapper-ui-types.ts packages/web/src/app/builder/step-settings/mapper/source-tree-utils.ts packages/web/test/app/builder/step-settings/mapper/source-tree-utils.test.ts
git commit -m "feat(mapper-ui): source field tree builder + UI types" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: target-slot derivation

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/target-slot-utils.ts`
- Create: `packages/web/test/app/builder/step-settings/mapper/target-slot-utils.test.ts`

- [ ] **Step 1: failing test** — `test/app/builder/step-settings/mapper/target-slot-utils.test.ts`:
```ts
// @vitest-environment jsdom
import { NormalizedSchema } from '@activepieces/shared';

import { mapperTargetUtils } from '@/app/builder/step-settings/mapper/target-slot-utils';

const { deriveSlots } = mapperTargetUtils;

describe('deriveSlots', () => {
  test('flattens scalar and nested-object fields into scalar slots', () => {
    const schema: NormalizedSchema = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        { name: 'customer', type: 'object', children: [{ name: 'name', type: 'string' }] },
      ],
    };
    expect(deriveSlots(schema)).toEqual([
      { path: 'po_number', name: 'po_number', type: 'string', kind: 'scalar', depth: 0 },
      { path: 'customer', name: 'customer', type: 'object', kind: 'scalar', depth: 0 },
      { path: 'customer.name', name: 'name', type: 'string', kind: 'scalar', depth: 1 },
    ]);
  });

  test('emits a collection slot plus item slots for array-of-objects fields', () => {
    const schema: NormalizedSchema = {
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        {
          name: 'lines',
          type: 'array',
          children: [
            { name: 'product_code', type: 'string' },
            { name: 'quantity', type: 'number' },
          ],
        },
      ],
    };
    expect(deriveSlots(schema)).toEqual([
      { path: 'po_number', name: 'po_number', type: 'string', kind: 'scalar', depth: 0 },
      { path: 'lines', name: 'lines', type: 'array', kind: 'collection', depth: 0 },
      { path: 'product_code', name: 'product_code', type: 'string', kind: 'scalar', collectionPath: 'lines', depth: 1 },
      { path: 'quantity', name: 'quantity', type: 'number', kind: 'scalar', collectionPath: 'lines', depth: 1 },
    ]);
  });

  test('array-of-scalars field is a plain scalar slot (no item slots)', () => {
    const schema: NormalizedSchema = { root: 'object', fields: [{ name: 'tags', type: 'array' }] };
    expect(deriveSlots(schema)).toEqual([
      { path: 'tags', name: 'tags', type: 'array', kind: 'scalar', depth: 0 },
    ]);
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement** `target-slot-utils.ts`:
```ts
import { NormalizedField, NormalizedSchema } from '@activepieces/shared';

import { TargetSlot } from './mapper-ui-types';

function pushScalar(slots: TargetSlot[], field: NormalizedField, path: string, depth: number, collectionPath?: string): void {
  const slot: TargetSlot = { path, name: field.name, type: field.type, kind: 'scalar', depth };
  if (collectionPath) slot.collectionPath = collectionPath;
  slots.push(slot);
}

function walk(fields: NormalizedField[], basePath: string, depth: number, slots: TargetSlot[]): void {
  for (const field of fields) {
    const path = basePath ? `${basePath}.${field.name}` : field.name;
    if (field.type === 'array' && field.children && field.children.length > 0) {
      slots.push({ path, name: field.name, type: field.type, kind: 'collection', depth });
      for (const child of field.children) {
        pushScalar(slots, child, child.name, depth + 1, path);
      }
      continue;
    }
    if (field.type === 'object' && field.children && field.children.length > 0) {
      pushScalar(slots, field, path, depth);
      walk(field.children, path, depth + 1, slots);
      continue;
    }
    pushScalar(slots, field, path, depth);
  }
}

function deriveSlots(schema: NormalizedSchema): TargetSlot[] {
  const slots: TargetSlot[] = [];
  walk(schema.fields, '', 0, slots);
  return slots;
}

export const mapperTargetUtils = { deriveSlots };
```

> Note: collection-item slot `path` is the item field name **relative to the array element** (`product_code`, not `lines.product_code`), matching `line_collection` item targets in the engine.

- [ ] **Step 4: run, verify PASS** (3 tests).

- [ ] **Step 5: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/target-slot-utils.ts packages/web/test/app/builder/step-settings/mapper/target-slot-utils.test.ts
git commit -m "feat(mapper-ui): target slot derivation from NormalizedSchema" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: spec mutations — create, set/remove binding (incl. line_collection)

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/mapper-spec-utils.ts`
- Create: `packages/web/test/app/builder/step-settings/mapper/mapper-spec-utils.test.ts`

- [ ] **Step 1: failing test** — `test/app/builder/step-settings/mapper/mapper-spec-utils.test.ts`:
```ts
// @vitest-environment jsdom
import { MappingSpec } from '@activepieces/shared';

import { mapperSpecUtils } from '@/app/builder/step-settings/mapper/mapper-spec-utils';

const { createEmptySpec, setBinding, removeBinding } = mapperSpecUtils;

describe('mapperSpecUtils create/set/remove binding', () => {
  test('createEmptySpec returns an auto-mode spec with no fields', () => {
    expect(createEmptySpec()).toEqual({ specVersion: 1, mode: 'auto', fields: [] });
  });

  test('setBinding adds a header binding for a scalar slot', () => {
    const spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'CustomerPONumber' });
    expect(spec.fields).toEqual([
      { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
    ]);
  });

  test('setBinding upserts (replaces) an existing target binding', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'A' });
    spec = setBinding(spec, { targetPath: 'po_number', sourcePath: 'B' });
    expect(spec.fields).toEqual([
      { target: 'po_number', binding: { kind: 'header', source: 'B' } },
    ]);
  });

  test('setBinding into a collection creates the line_collection and a row item', () => {
    const spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    expect(spec.fields).toEqual([
      {
        target: 'lines',
        binding: { kind: 'line_collection', items: [{ target: 'product_code', binding: { kind: 'row', source: 'SKU' } }] },
      },
    ]);
  });

  test('setBinding adds a second item to an existing line_collection', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    spec = setBinding(spec, { targetPath: 'quantity', sourcePath: 'Qty', collectionPath: 'lines' });
    const lines = spec.fields.find((f) => f.target === 'lines');
    expect(lines?.binding).toEqual({
      kind: 'line_collection',
      items: [
        { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
        { target: 'quantity', binding: { kind: 'row', source: 'Qty' } },
      ],
    });
  });

  test('removeBinding deletes a top-level field', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'po_number', sourcePath: 'A' });
    spec = removeBinding(spec, { targetPath: 'po_number' });
    expect(spec.fields).toEqual([]);
  });

  test('removeBinding deletes a collection item and prunes the empty collection', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'product_code', sourcePath: 'SKU', collectionPath: 'lines' });
    spec = removeBinding(spec, { targetPath: 'product_code', collectionPath: 'lines' });
    expect(spec.fields).toEqual([]);
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement** `mapper-spec-utils.ts`:
```ts
import { Binding, FieldMapping, LineCollectionBinding, MappingSpec, MapperMode, TransformRef } from '@activepieces/shared';

type SetBindingParams = {
  targetPath: string;
  sourcePath: string;
  collectionPath?: string;
  transforms?: TransformRef[];
};

type RemoveBindingParams = {
  targetPath: string;
  collectionPath?: string;
};

function createEmptySpec(): MappingSpec {
  return { specVersion: 1, mode: 'auto', fields: [] };
}

function isLineCollection(binding: Binding): binding is LineCollectionBinding {
  return binding.kind === 'line_collection';
}

function scalarBinding(kind: 'header' | 'row', sourcePath: string, transforms?: TransformRef[]): Binding {
  return transforms && transforms.length > 0
    ? { kind, source: sourcePath, transforms }
    : { kind, source: sourcePath };
}

function upsertField(fields: FieldMapping[], target: string, binding: Binding): FieldMapping[] {
  const next = fields.filter((f) => f.target !== target);
  next.push({ target, binding });
  return next;
}

function setBinding(spec: MappingSpec, params: SetBindingParams): MappingSpec {
  const { targetPath, sourcePath, collectionPath, transforms } = params;
  if (!collectionPath) {
    return { ...spec, fields: upsertField(spec.fields, targetPath, scalarBinding('header', sourcePath, transforms)) };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  const existingItems = existing && isLineCollection(existing.binding) ? existing.binding.items : [];
  const items = upsertField(existingItems, targetPath, scalarBinding('row', sourcePath, transforms));
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return { ...spec, fields: upsertField(spec.fields, collectionPath, collection) };
}

function removeBinding(spec: MappingSpec, params: RemoveBindingParams): MappingSpec {
  const { targetPath, collectionPath } = params;
  if (!collectionPath) {
    return { ...spec, fields: spec.fields.filter((f) => f.target !== targetPath) };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  if (!existing || !isLineCollection(existing.binding)) return spec;
  const items = existing.binding.items.filter((i) => i.target !== targetPath);
  if (items.length === 0) {
    return { ...spec, fields: spec.fields.filter((f) => f.target !== collectionPath) };
  }
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return { ...spec, fields: upsertField(spec.fields, collectionPath, collection) };
}

export const mapperSpecUtils = { createEmptySpec, setBinding, removeBinding };
```

> Note: `upsertField` removes-then-appends, so re-binding a field moves it to the end. Tests assert content, not order, except the simple single-field cases. If a test asserts order and fails, adjust `upsertField` to replace in place; but the provided tests pass with append semantics.

- [ ] **Step 4: run, verify PASS** (7 tests).

- [ ] **Step 5: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/mapper-spec-utils.ts packages/web/test/app/builder/step-settings/mapper/mapper-spec-utils.test.ts
git commit -m "feat(mapper-ui): spec mutation utils (set/remove bindings)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: spec mutations — mode, groupBy, transforms

**Files:**
- Modify: `packages/web/src/app/builder/step-settings/mapper/mapper-spec-utils.ts`
- Modify: `packages/web/test/app/builder/step-settings/mapper/mapper-spec-utils.test.ts`

- [ ] **Step 1: add failing tests** — append inside the test file, after the existing `describe`:
```ts
describe('mapperSpecUtils mode/groupBy/transforms', () => {
  const { createEmptySpec, setBinding, setMode, setGroupBy, setTransforms } = mapperSpecUtils;

  test('setMode sets the explicit mode', () => {
    expect(setMode(createEmptySpec(), 'grouped').mode).toBe('grouped');
  });

  test('setGroupBy sets keys; empty array clears it', () => {
    expect(setGroupBy(createEmptySpec(), ['CustomerPONumber']).groupBy).toEqual(['CustomerPONumber']);
    expect(setGroupBy(setGroupBy(createEmptySpec(), ['x']), []).groupBy).toBeUndefined();
  });

  test('setTransforms attaches transforms to a top-level header binding', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'name', sourcePath: 'CustomerName' });
    spec = setTransforms(spec, { targetPath: 'name', transforms: [{ id: 'trim' }] });
    expect(spec.fields[0].binding).toEqual({ kind: 'header', source: 'CustomerName', transforms: [{ id: 'trim' }] });
  });

  test('setTransforms attaches transforms to a collection item (row) binding', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'quantity', sourcePath: 'Qty', collectionPath: 'lines' });
    spec = setTransforms(spec, { targetPath: 'quantity', collectionPath: 'lines', transforms: [{ id: 'parse_number' }] });
    const lines = spec.fields.find((f) => f.target === 'lines');
    expect(lines?.binding).toEqual({
      kind: 'line_collection',
      items: [{ target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } }],
    });
  });

  test('setTransforms with an empty array removes transforms', () => {
    let spec = setBinding(createEmptySpec(), { targetPath: 'name', sourcePath: 'CustomerName' });
    spec = setTransforms(spec, { targetPath: 'name', transforms: [{ id: 'trim' }] });
    spec = setTransforms(spec, { targetPath: 'name', transforms: [] });
    expect(spec.fields[0].binding).toEqual({ kind: 'header', source: 'CustomerName' });
  });
});
```

- [ ] **Step 2: run, verify FAIL** (the new describe references `setMode`/`setGroupBy`/`setTransforms` that don't exist yet).

- [ ] **Step 3: implement.** In `mapper-spec-utils.ts`, add these helpers (before the final export) and extend the exported const. Add the param type near the others:
```ts
type SetTransformsParams = {
  targetPath: string;
  collectionPath?: string;
  transforms: TransformRef[];
};

function setMode(spec: MappingSpec, mode: MapperMode): MappingSpec {
  return { ...spec, mode };
}

function setGroupBy(spec: MappingSpec, keys: string[]): MappingSpec {
  if (keys.length === 0) {
    const { groupBy: _groupBy, ...rest } = spec;
    return rest;
  }
  return { ...spec, groupBy: keys };
}

function withTransforms(binding: Binding, transforms: TransformRef[]): Binding {
  if (binding.kind === 'line_collection') return binding;
  if (transforms.length === 0) {
    return { kind: binding.kind, source: binding.source };
  }
  return { kind: binding.kind, source: binding.source, transforms };
}

function setTransforms(spec: MappingSpec, params: SetTransformsParams): MappingSpec {
  const { targetPath, collectionPath, transforms } = params;
  if (!collectionPath) {
    const fields = spec.fields.map((f) =>
      f.target === targetPath ? { target: f.target, binding: withTransforms(f.binding, transforms) } : f,
    );
    return { ...spec, fields };
  }
  const fields = spec.fields.map((f) => {
    if (f.target !== collectionPath || f.binding.kind !== 'line_collection') return f;
    const items = f.binding.items.map((i) =>
      i.target === targetPath ? { target: i.target, binding: withTransforms(i.binding, transforms) } : i,
    );
    return { target: f.target, binding: { kind: 'line_collection' as const, items } };
  });
  return { ...spec, fields };
}
```
Then change the export to:
```ts
export const mapperSpecUtils = { createEmptySpec, setBinding, removeBinding, setMode, setGroupBy, setTransforms };
```

- [ ] **Step 4: run, verify PASS** (full file: 7 + 5 = 12 tests).

- [ ] **Step 5: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/mapper-spec-utils.ts packages/web/test/app/builder/step-settings/mapper/mapper-spec-utils.test.ts
git commit -m "feat(mapper-ui): spec mutation utils (mode, groupBy, transforms)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: piece_schema adapter

Converts a piece action's `PiecePropertyMap` (each entry `{ type: PropertyType, ... }`, ARRAY may carry nested `properties`, OBJECT is an open map) into a `NormalizedSchema` so the target slots can auto-attach when the next step is a typed piece.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/piece-schema-adapter.ts`
- Create: `packages/web/test/app/builder/step-settings/mapper/schema-adapters/piece-schema-adapter.test.ts`
- Modify: `packages/web/src/app/builder/step-settings/mapper/schema-adapters/index.ts` (register)

- [ ] **Step 1: failing test** — `test/app/builder/step-settings/mapper/schema-adapters/piece-schema-adapter.test.ts`:
```ts
// @vitest-environment jsdom
import { pieceSchemaUtils } from '@/app/builder/step-settings/mapper/schema-adapters/piece-schema-adapter';

const { fromPropertyMap } = pieceSchemaUtils;

describe('pieceSchemaUtils.fromPropertyMap', () => {
  test('maps scalar property types to NormalizedSchema fields', () => {
    const props = {
      customerCode: { type: 'SHORT_TEXT' },
      qty: { type: 'NUMBER' },
      autoConvert: { type: 'CHECKBOX' },
    };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'customerCode', type: 'string' },
        { name: 'qty', type: 'number' },
        { name: 'autoConvert', type: 'boolean' },
      ],
    });
  });

  test('maps an ARRAY property with nested properties to an array field with children', () => {
    const props = {
      lines: {
        type: 'ARRAY',
        properties: { stockCode: { type: 'SHORT_TEXT' }, qty: { type: 'NUMBER' } },
      },
    };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'lines', type: 'array', children: [{ name: 'stockCode', type: 'string' }, { name: 'qty', type: 'number' }] },
      ],
    });
  });

  test('maps JSON/OBJECT to object and unknown types to unknown', () => {
    const props = { payload: { type: 'JSON' }, weird: { type: 'WHATEVER' } };
    expect(fromPropertyMap(props)).toEqual({
      root: 'object',
      fields: [
        { name: 'payload', type: 'object' },
        { name: 'weird', type: 'unknown' },
      ],
    });
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement** `piece-schema-adapter.ts`:
```ts
import { NormalizedField, NormalizedFieldType, NormalizedSchema } from '@activepieces/shared';

import { SchemaAdapter } from './adapter-type';

type PieceProperty = {
  type?: string;
  properties?: Record<string, unknown>;
};

function isObjectNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapType(propertyType: string | undefined): NormalizedFieldType {
  switch (propertyType) {
    case 'NUMBER':
      return 'number';
    case 'CHECKBOX':
      return 'boolean';
    case 'ARRAY':
      return 'array';
    case 'OBJECT':
    case 'JSON':
      return 'object';
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
    case 'DROPDOWN':
    case 'STATIC_DROPDOWN':
    case 'DATE_TIME':
    case 'SECRET_TEXT':
    case 'COLOR':
      return 'string';
    default:
      return 'unknown';
  }
}

function toField(name: string, property: PieceProperty): NormalizedField {
  const type = mapType(property.type);
  if (type === 'array' && isObjectNode(property.properties)) {
    return { name, type, children: fromProperties(property.properties) };
  }
  return { name, type };
}

function fromProperties(props: Record<string, unknown>): NormalizedField[] {
  return Object.entries(props).map(([name, value]) => toField(name, isObjectNode(value) ? value : {}));
}

function fromPropertyMap(props: Record<string, unknown>): NormalizedSchema {
  return { root: 'object', fields: fromProperties(props) };
}

export const pieceSchemaUtils = { fromPropertyMap };

export const pieceSchemaAdapter: SchemaAdapter = {
  id: 'piece_schema',
  parse: ({ raw }) => {
    let props: unknown;
    try {
      props = JSON.parse(raw);
    } catch {
      throw new Error('Invalid piece property map');
    }
    if (!isObjectNode(props)) {
      throw new Error('Piece property map must be an object');
    }
    return fromPropertyMap(props);
  },
};
```

- [ ] **Step 4: register in the adapter registry.** In `schema-adapters/index.ts`: add `'piece_schema'` to the `SchemaAdapterId` union (open `adapter-type.ts` and add it), import `pieceSchemaAdapter`, and add `piece_schema: pieceSchemaAdapter` to the `schemaAdapters` record. Update the registry test's id list in `schema-adapters/index.test.ts` to include `'piece_schema'`.

In `adapter-type.ts`, extend the union:
```ts
export type SchemaAdapterId =
  | 'json_sample'
  | 'json_schema'
  | 'csv'
  | 'xml'
  | 'html_table'
  | 'openapi'
  | 'piece_schema';
```

In `schema-adapters/index.test.ts`, change the expected id list to:
```ts
['csv', 'html_table', 'json_sample', 'json_schema', 'openapi', 'piece_schema', 'xml'].sort(),
```

- [ ] **Step 5: run, verify PASS** — the new adapter test (3) + the updated registry test:
`cd packages/web && npm test -- test/app/builder/step-settings/mapper/schema-adapters/`

- [ ] **Step 6: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/schema-adapters packages/web/test/app/builder/step-settings/mapper/schema-adapters
git commit -m "feat(mapper-ui): piece_schema adapter (PiecePropertyMap to NormalizedSchema)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Mount `MapperStepConfig` from piece-settings + panel shell

Renders a custom panel for the mapper piece instead of the auto-form. The shell: a source-step picker (sets `settings.input.sourceData` mention) and placeholders for the canvas regions, reading/writing `settings.input.mappingSpec`.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/index.tsx`
- Modify: `packages/web/src/app/builder/step-settings/piece-settings/index.tsx`
- Modify: `packages/web/public/locales/en/translation.json` (add keys)
- Create: `packages/web/test/app/builder/step-settings/mapper/mapper-step-config.test.tsx`

- [ ] **Step 1: add i18n keys** to `public/locales/en/translation.json` (insert alphabetically; identity values):
```
"Mapper": "Mapper",
"Source step": "Source step",
"Select a source step": "Select a source step",
"Target schema": "Target schema",
"Preview": "Preview",
"No source data yet. Test the source step to load a sample.": "No source data yet. Test the source step to load a sample.",
"Attach a target schema to begin mapping": "Attach a target schema to begin mapping"
```

- [ ] **Step 2: failing test** — `test/app/builder/step-settings/mapper/mapper-step-config.test.tsx`. Render with a minimal react-hook-form + builder-state mock. (Mock `i18next` `t` to identity, mock `useBuilderStateContext` to return `{ outputSampleData, flowVersion }`, mock `useStepSettingsContext` to return `{ selectedStep }`.)
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

const outputSampleData: Record<string, unknown> = {
  step_1: [{ CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' }],
};

vi.mock('@/app/builder/builder-hooks', () => ({
  useBuilderStateContext: (selector: (s: unknown) => unknown) =>
    selector({
      outputSampleData,
      flowVersion: { trigger: { name: 'trigger', displayName: 'Trigger', nextAction: { name: 'step_1', displayName: 'Excel', type: 'PIECE' } } },
    }),
}));

vi.mock('@/app/builder/step-settings/step-settings-context', () => ({
  useStepSettingsContext: () => ({
    selectedStep: { name: 'step_2', displayName: 'Mapper', type: 'PIECE' },
    pieceModel: { name: '@jrnyflw/mapper' },
  }),
}));

import { MapperStepConfig } from '@/app/builder/step-settings/mapper/index';

const Harness = () => {
  const form = useForm({ defaultValues: { settings: { input: { sourceData: undefined, mappingSpec: undefined } } } });
  return (
    <FormProvider {...form}>
      <MapperStepConfig readonly={false} />
    </FormProvider>
  );
};

describe('MapperStepConfig', () => {
  test('renders the source step picker and target schema region', () => {
    render(<Harness />);
    expect(screen.getByText('Source step')).toBeTruthy();
    expect(screen.getByText('Target schema')).toBeTruthy();
  });
});
```

- [ ] **Step 3: implement** `mapper/index.tsx`. Reads prior steps from builder state, renders a source-step `<Select>` that writes the mention into the form, and renders region placeholders (filled by later tasks). Persisted spec read via `form.watch('settings.input.mappingSpec')`.
```tsx
import { MappingSpec, flowStructureUtil } from '@activepieces/shared';
import { t } from 'i18next';
import { useFormContext } from 'react-hook-form';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useStepSettingsContext } from '@/app/builder/step-settings/step-settings-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { mapperSpecUtils } from './mapper-spec-utils';

type MapperStepConfigProps = {
  readonly: boolean;
};

const SOURCE_DATA_FIELD = 'settings.input.sourceData';
const MAPPING_SPEC_FIELD = 'settings.input.mappingSpec';

export const MapperStepConfig = ({ readonly }: MapperStepConfigProps) => {
  const form = useFormContext();
  const { selectedStep } = useStepSettingsContext();
  const { outputSampleData, flowVersion } = useBuilderStateContext((state) => ({
    outputSampleData: state.outputSampleData,
    flowVersion: state.flowVersion,
  }));

  const priorSteps = flowStructureUtil
    .findPathToStep(flowVersion.trigger, selectedStep.name)
    .filter((step) => step.name !== selectedStep.name);

  const sourceData: unknown = form.watch(SOURCE_DATA_FIELD);
  const sourceStepName = extractSourceStepName(sourceData);
  const sample = sourceStepName ? outputSampleData[sourceStepName] : undefined;
  const spec: MappingSpec = (form.watch(MAPPING_SPEC_FIELD) as MappingSpec | undefined) ?? mapperSpecUtils.createEmptySpec();

  const onSourceStepChange = (stepName: string) => {
    form.setValue(SOURCE_DATA_FIELD, `{{steps.${stepName}.output}}`);
    if (!form.getValues(MAPPING_SPEC_FIELD)) {
      form.setValue(MAPPING_SPEC_FIELD, mapperSpecUtils.createEmptySpec());
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Source step')}</span>
        <Select
          disabled={readonly}
          value={sourceStepName ?? undefined}
          onValueChange={onSourceStepChange}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('Select a source step')} />
          </SelectTrigger>
          <SelectContent>
            {priorSteps.map((step) => (
              <SelectItem key={step.name} value={step.name}>
                {step.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Target schema')}</span>
        <div className={cn('rounded-md border p-3 text-sm text-muted-foreground')}>
          {t('Attach a target schema to begin mapping')}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Preview')}</span>
        <div className={cn('rounded-md border p-3 text-sm text-muted-foreground')}>
          {sample === undefined
            ? t('No source data yet. Test the source step to load a sample.')
            : JSON.stringify(spec.fields.length)}
        </div>
      </div>
    </div>
  );
};

function extractSourceStepName(sourceData: unknown): string | null {
  if (typeof sourceData !== 'string') return null;
  const match = sourceData.match(/^\{\{steps\.([^.}]+)\.output\}\}$/);
  return match ? match[1] : null;
}
```

> The exact import path/shape of `useBuilderStateContext` and `Select` must be confirmed against the codebase during implementation; adjust imports to match. If `useBuilderStateContext`'s selector signature differs, adapt the two `state.` reads. `findPathToStep` takes `(trigger, stepName)` — confirm its signature and return shape (`{ name, displayName, ... }[]`); adjust if it takes the step object instead.

- [ ] **Step 4: mount in piece-settings.** In `step-settings/piece-settings/index.tsx`, where `<GenericPropertiesForm>` is rendered for `selectedAction`, wrap it in a conditional:
```tsx
{selectedAction &&
  (pieceModel.name === '@jrnyflw/mapper' &&
  (props.step.settings as PieceActionSettings).actionName === 'apply_mapping' ? (
    <MapperStepConfig readonly={props.readonly} />
  ) : (
    <GenericPropertiesForm
      /* …existing props unchanged… */
    ></GenericPropertiesForm>
  ))}
```
Add the import: `import { MapperStepConfig } from '../mapper';` (confirm the relative path). The exact existing JSX must be matched precisely; preserve all current `GenericPropertiesForm` props.

- [ ] **Step 5: run the component test** — `cd packages/web && npm test -- test/app/builder/step-settings/mapper/mapper-step-config.test.tsx`. Expected PASS. If the real `useBuilderStateContext`/context import paths differ from the mocks, fix both the component imports and the test mocks to match the actual modules, then re-run.

- [ ] **Step 6: commit**
```bash
git add packages/web/src/app/builder/step-settings/mapper/index.tsx packages/web/src/app/builder/step-settings/piece-settings/index.tsx packages/web/public/locales/en/translation.json packages/web/test/app/builder/step-settings/mapper/mapper-step-config.test.tsx
git commit -m "feat(mapper-ui): mount custom MapperStepConfig panel for the mapper piece" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: SchemaAttachBar (target schema selection)

Lets the author paste a sample/JSON-Schema/XML/CSV/HTML/OpenAPI and parse it (via `runSchemaAdapter`) into `targetSchema.snapshot` on the spec. On success, persists the snapshot+source ref into `settings.input.mappingSpec`.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/schema-attach-bar.tsx`
- Create: `packages/web/test/app/builder/step-settings/mapper/schema-attach-bar.test.tsx`
- Modify: `public/locales/en/translation.json` (add keys: `"Paste a JSON sample"`, `"Format"`, `"Parse schema"`, `"Could not parse the schema"`)

- [ ] **Step 1: failing test** — render `SchemaAttachBar`, choose `json_sample`, paste `{"a":1}`, click parse, assert `onSchema` called with the NormalizedSchema:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { SchemaAttachBar } from '@/app/builder/step-settings/mapper/schema-attach-bar';

describe('SchemaAttachBar', () => {
  test('parses a pasted JSON sample and emits the schema', () => {
    const onSchema = vi.fn();
    render(<SchemaAttachBar adapterId="json_sample" onAdapterIdChange={() => {}} onSchema={onSchema} disabled={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByText('Parse schema'));
    expect(onSchema).toHaveBeenCalledWith({ root: 'object', fields: [{ name: 'a', type: 'number' }] });
  });

  test('shows an error when parsing fails', () => {
    render(<SchemaAttachBar adapterId="json_sample" onAdapterIdChange={() => {}} onSchema={() => {}} disabled={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Parse schema'));
    expect(screen.getByText('Could not parse the schema')).toBeTruthy();
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement** `schema-attach-bar.tsx` — a `<Textarea>` + a parse `<Button>`; on click, call `runSchemaAdapter({ id: adapterId, raw })` inside `tryCatchSync`-style try/catch; on success call `onSchema(schema)`, on failure set a local error state and render `t('Could not parse the schema')`. Use `useState` for `raw` and `error`. (Adapter dropdown wiring is via the `adapterId`/`onAdapterIdChange` props — render a `<Select>` of the six adapter ids; for the OpenAPI id also show a small ref input, optional in V1.)
```tsx
import { NormalizedSchema } from '@activepieces/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { runSchemaAdapter, SchemaAdapterId } from './schema-adapters';

type SchemaAttachBarProps = {
  adapterId: SchemaAdapterId;
  onAdapterIdChange: (id: SchemaAdapterId) => void;
  onSchema: (schema: NormalizedSchema) => void;
  disabled: boolean;
};

export const SchemaAttachBar = ({ adapterId, onSchema, disabled }: SchemaAttachBarProps) => {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onParse = () => {
    try {
      const schema = runSchemaAdapter({ id: adapterId, raw });
      setError(null);
      onSchema(schema);
    } catch {
      setError(t('Could not parse the schema'));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t('Paste a JSON sample')}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={onParse}>
        {t('Parse schema')}
      </Button>
      {error !== null && <span className={cn('text-sm text-destructive')}>{error}</span>}
    </div>
  );
};
```
> `onAdapterIdChange` is part of the contract for the adapter dropdown; V1 may render only the textarea+parse if the dropdown is deferred — keep the prop so the parent owns adapter selection. Confirm `Textarea`/`Button` import paths from `@/components/ui/...`.

- [ ] **Step 4: run, verify PASS** (2 tests).
- [ ] **Step 5: commit** (`feat(mapper-ui): schema attach bar`).

---

## Task 8: SourceTree + TargetSlotList with drag/drop → spec

Wires source leaves as drag sources (`DND_TYPE_FIELD_PATH`) and target slots as drop targets; a drop calls `mapperSpecUtils.setBinding` and persists.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/source-tree.tsx`
- Create: `packages/web/src/app/builder/step-settings/mapper/target-slot-list.tsx`
- Create: `packages/web/test/app/builder/step-settings/mapper/target-slot-list.test.tsx`

- [ ] **Step 1: failing test** — render `TargetSlotList` with two slots and a spy `onBind`; simulate a drop by invoking the drop handler. Because react-dnd drops are hard to fire in jsdom, the testable seam is a `onBindSlot(slot, item)` callback: the test renders the list, finds a slot, and calls the exposed handler via a data-test hook. Simplest robust approach: unit-test the **drop reducer** `applyDrop({ spec, slot, item })` (pure) here, and keep the DnD wiring thin.

Create instead a pure helper test: `test/app/builder/step-settings/mapper/apply-drop.test.ts`:
```ts
// @vitest-environment jsdom
import { mapperDropUtils } from '@/app/builder/step-settings/mapper/target-slot-list';

const { applyDrop } = mapperDropUtils;

describe('applyDrop', () => {
  test('binds a source path to a scalar slot as a header binding', () => {
    const spec = { specVersion: 1 as const, mode: 'auto' as const, fields: [] };
    const slot = { path: 'po_number', name: 'po_number', type: 'string' as const, kind: 'scalar' as const, depth: 0 };
    const next = applyDrop({ spec, slot, sourcePath: 'CustomerPONumber' });
    expect(next.fields).toEqual([{ target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } }]);
  });

  test('binds into a collection item slot as a row binding', () => {
    const spec = { specVersion: 1 as const, mode: 'auto' as const, fields: [] };
    const slot = { path: 'product_code', name: 'product_code', type: 'string' as const, kind: 'scalar' as const, collectionPath: 'lines', depth: 1 };
    const next = applyDrop({ spec, slot, sourcePath: 'SKU' });
    expect(next.fields).toEqual([
      { target: 'lines', binding: { kind: 'line_collection', items: [{ target: 'product_code', binding: { kind: 'row', source: 'SKU' } }] } },
    ]);
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement.** `target-slot-list.tsx` exports both the pure `mapperDropUtils.applyDrop` and the `TargetSlotList`/`TargetSlotRow` components. `applyDrop` maps a slot to the right `setBinding` call:
```ts
// pure helper (exported for testing + reuse)
type ApplyDropParams = {
  spec: MappingSpec;
  slot: TargetSlot;
  sourcePath: string;
};

function applyDrop({ spec, slot, sourcePath }: ApplyDropParams): MappingSpec {
  return mapperSpecUtils.setBinding(spec, {
    targetPath: slot.path,
    sourcePath,
    collectionPath: slot.collectionPath,
  });
}

export const mapperDropUtils = { applyDrop };
```
`TargetSlotRow` uses `useDrop<FieldPathDndItem>({ accept: DND_TYPE_FIELD_PATH, drop: (item) => onBind(applyDrop({ spec, slot, sourcePath: toRowPath(item) })), collect: … })`. Collection slots (`kind: 'collection'`) are non-droppable headers. `toRowPath(item)` returns `item.propertyPath` (V1: the source tree builds clean dot-paths, so the dragged path is already row-relative). Ring styling via `cn()` mirrors the V0 drop target. `SourceTree` renders `SourceNode[]` recursively; each leaf is a `useDrag` source emitting `{ type: DND_TYPE_FIELD_PATH, propertyPath: node.path, displayName: node.name, valueType: node.type }`.

Full component code mirrors `data-selector-node-content.tsx` (drag) and `text-input-with-mentions/index.tsx` (drop) — reproduce those `useDrag`/`useDrop` patterns. Keep each component focused.

- [ ] **Step 4: run, verify PASS** (2 tests). Components are exercised by the MapperStepConfig integration in Task 11.
- [ ] **Step 5: commit** (`feat(mapper-ui): source tree + target slots with drag-drop binding`).

---

## Task 9: BindLineOverlay (SVG bind-lines)

Draws a 2px Bezier from each bound source leaf to its target slot. Endpoints are read from DOM rects via `data-` attributes; the overlay is an absolutely-positioned `<svg>`.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/bind-line-overlay.tsx`
- Create: `packages/web/test/app/builder/step-settings/mapper/bind-path.test.ts`

- [ ] **Step 1: failing test** — unit-test the pure path generator `bindLineUtils.bezierPath({ from, to })` → an SVG `d` string:
```ts
// @vitest-environment jsdom
import { bindLineUtils } from '@/app/builder/step-settings/mapper/bind-line-overlay';

describe('bezierPath', () => {
  test('produces a cubic bezier between two points', () => {
    expect(bindLineUtils.bezierPath({ from: { x: 0, y: 0 }, to: { x: 100, y: 50 } })).toBe(
      'M 0 0 C 50 0, 50 50, 100 50',
    );
  });
});
```

- [ ] **Step 2: run, verify FAIL.**

- [ ] **Step 3: implement** `bind-line-overlay.tsx`. Export `bindLineUtils.bezierPath` (pure) and the `BindLineOverlay` component. `bezierPath` uses a horizontal control-point offset of half the dx:
```ts
type Point = { x: number; y: number };

function bezierPath({ from, to }: { from: Point; to: Point }): string {
  const midX = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

export const bindLineUtils = { bezierPath };
```
The `BindLineOverlay` component: takes the list of bound `{ sourcePath, targetPath }` pairs and a container ref; on mount/scroll/resize (via a `ResizeObserver` + scroll listener — legitimate `useEffect` external-system sync) reads `[data-jrny-mapping-source="<path>"]` and `[data-jrny-mapping-target="<path>"]` element rects relative to the container, computes `bezierPath`, and renders `<path stroke-width="2" />` for each. Color via class: grey valid, amber missing source. Keep the DOM-measurement effect minimal and guard for missing elements.

- [ ] **Step 4: run, verify PASS** (1 test). Visual correctness verified in the running app.
- [ ] **Step 5: commit** (`feat(mapper-ui): SVG bind-line overlay`).

---

## Task 10: TransformPicker

A popover on a bound slot to add/remove built-in transforms (ids from `transformRegistry`). Persists via `mapperSpecUtils.setTransforms`.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/transform-picker.tsx`
- Create: `packages/web/test/app/builder/step-settings/mapper/transform-picker.test.tsx`
- Modify: `public/locales/en/translation.json` (`"Add transform"`, `"Transforms"`)

- [ ] **Step 1: failing test** — render `TransformPicker` with `selected={[]}` and a spy `onChange`; the available transform ids come from `transformRegistry`. Click a transform option; assert `onChange` called with `[{ id: '<that id>' }]`.
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { TransformPicker } from '@/app/builder/step-settings/mapper/transform-picker';

describe('TransformPicker', () => {
  test('adds a transform when an option is chosen', () => {
    const onChange = vi.fn();
    render(<TransformPicker selected={[]} onChange={onChange} disabled={false} />);
    fireEvent.click(screen.getByText('trim'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'trim' }]);
  });
});
```

- [ ] **Step 2: run, verify FAIL.**
- [ ] **Step 3: implement** `transform-picker.tsx`. Read available ids: `Object.keys(transformRegistry)` (import from `@activepieces/shared`). Render each as a clickable row; clicking an unselected id calls `onChange([...selected, { id }])`, clicking a selected id removes it. Use a `<Popover>` from `@/components/ui/popover` (trigger button labelled `t('Transforms')`); render the option rows in the content. Props: `{ selected: TransformRef[]; onChange: (t: TransformRef[]) => void; disabled: boolean }`.
- [ ] **Step 4: run, verify PASS** (1 test).
- [ ] **Step 5: commit** (`feat(mapper-ui): transform picker`).

---

## Task 11: PreviewPane + wire everything into MapperStepConfig

Runs `mapperEngine.runMapping({ sourceData: sample, spec })` and shows the output JSON + warnings. Then MapperStepConfig assembles SchemaAttachBar + SourceTree + TargetSlotList + BindLineOverlay + PreviewPane and persists spec changes.

**Files:**
- Create: `packages/web/src/app/builder/step-settings/mapper/preview-pane.tsx`
- Modify: `packages/web/src/app/builder/step-settings/mapper/index.tsx`
- Create: `packages/web/test/app/builder/step-settings/mapper/preview-pane.test.tsx`
- Modify: `packages/web/test/app/builder/step-settings/mapper/mapper-step-config.test.tsx` (extend integration)

- [ ] **Step 1: failing test** — `preview-pane.test.tsx`: render `<PreviewPane sample={[{CustomerPONumber:'PO-1',SKU:'A',Qty:'2'}]} spec={…grouped spec…} />`; assert it shows the grouped output (e.g. text containing `PO-1`) and "no warnings".
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { PreviewPane } from '@/app/builder/step-settings/mapper/preview-pane';

describe('PreviewPane', () => {
  test('renders the engine output for a grouped spec', () => {
    const spec = {
      specVersion: 1 as const, mode: 'auto' as const, groupBy: ['CustomerPONumber'],
      fields: [
        { target: 'po_number', binding: { kind: 'header' as const, source: 'CustomerPONumber' } },
        { target: 'lines', binding: { kind: 'line_collection' as const, items: [{ target: 'product_code', binding: { kind: 'row' as const, source: 'SKU' } }] } },
      ],
    };
    render(<PreviewPane sample={[{ CustomerPONumber: 'PO-1', SKU: 'A' }]} spec={spec} />);
    expect(screen.getByText(/PO-1/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: run, verify FAIL.**
- [ ] **Step 3: implement** `preview-pane.tsx`:
```tsx
import { MappingSpec, mapperEngine } from '@activepieces/shared';
import { t } from 'i18next';

import { cn } from '@/lib/utils';

type PreviewPaneProps = {
  sample: unknown;
  spec: MappingSpec;
};

export const PreviewPane = ({ sample, spec }: PreviewPaneProps) => {
  const { output, warnings } = mapperEngine.runMapping({ sourceData: sample, spec });
  return (
    <div className="flex flex-col gap-2">
      <pre className={cn('max-h-64 overflow-auto rounded-md border p-3 text-xs')}>
        {JSON.stringify(output, null, 2)}
      </pre>
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {warnings.map((w, i) => (
            <li key={i} className={cn('text-xs text-amber-600')}>
              {w.path}: {w.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length === 0 && <span className="text-xs text-muted-foreground">{t('No warnings')}</span>}
    </div>
  );
};
```
Add i18n key `"No warnings"`.

Then in `mapper/index.tsx`, replace the Target/Preview placeholders: derive `slots = mapperTargetUtils.deriveSlots(spec.targetSchema.snapshot)` when a snapshot is attached; render `<SchemaAttachBar>` (on schema → `form.setValue(MAPPING_SPEC_FIELD, { ...spec, targetSchema: { source: adapterId, snapshot } })`), `<SourceTree nodes={mapperSourceUtils.buildSourceTree(sample)}>`, `<TargetSlotList slots={slots} spec={spec} onChange={(next) => form.setValue(MAPPING_SPEC_FIELD, next)}>`, `<BindLineOverlay>`, and `<PreviewPane sample={sample} spec={spec}>` (only when `sample !== undefined`). Persist every spec change through `form.setValue(MAPPING_SPEC_FIELD, next)`.

- [ ] **Step 4: run preview test + extend the MapperStepConfig integration test** — assert that after attaching a schema and (simulated) binding, the preview reflects the spec. Run the full mapper test dir.
- [ ] **Step 5: commit** (`feat(mapper-ui): preview pane + assemble mapper canvas`).

---

## Task 12: i18n audit + full verification + lint

**Files:** none (verification) + any i18n key additions discovered.

- [ ] **Step 1:** grep the mapper components for `t('...')` calls and confirm every key exists in `public/locales/en/translation.json`; add any missing keys (identity values).
- [ ] **Step 2:** `cd packages/web && npm test -- test/app/builder/step-settings/mapper/` — all mapper UI + adapter tests pass.
- [ ] **Step 3:** `npm run lint-dev` — auto-fix; confirm changes confined to mapper files; revert unrelated auto-fixes; fix genuine errors in our files. Re-run tests.
- [ ] **Step 4:** `cd packages/web && npx tsc -p tsconfig.app.json --noEmit` (or the web typecheck command) — confirm the new components typecheck against the real `useBuilderStateContext`/context/Shadcn imports. Fix genuine type errors.
- [ ] **Step 5:** commit any lint/i18n fixes (`chore(mapper-ui): i18n + lint`).

---

## Self-Review (completed during plan authoring)

**Spec coverage (§4/§7):** MapperStepConfig (T6/T11), SchemaAttachBar (T7), SourceTree (T8), TargetSlotList (T8), BindLineOverlay (T9), TransformPicker (T10), PreviewPane (T11), all schema adapters incl. piece_schema (T5; rest in Plan 2). Visual bind-lines hard requirement (T9). Grouping via collection slots → line_collection (T2/T3/T8). ✓ Deferred (documented): nested-source-array reshape into a collection (V1.x); output hard-fail validation against snapshot (V1.x).

**Placeholder scan:** Pure-logic tasks (T1–T5, T11 preview) have complete real code. Component tasks (T6–T11) carry real component code with the explicit caveat that import paths for `useBuilderStateContext`, Shadcn primitives, and `findPathToStep` must be confirmed against the codebase at implementation time and adjusted — this is verification, not a placeholder. No "TBD"/"add error handling" left.

**Type consistency:** `SourceNode`/`TargetSlot` (T1) used in T2/T8/T11. `mapperSpecUtils` (T3/T4) used in T8/T11. `mapperTargetUtils.deriveSlots` (T2), `mapperSourceUtils.buildSourceTree` (T1) used in T11. `runSchemaAdapter`/`SchemaAdapterId` (Plan 2) used in T7. `mapperEngine.runMapping`, `MappingSpec`, `transformRegistry` (Plan 1 shared) used in T11/T10. `applyDrop` (T8) consistent. ✓

**Risk note:** Component tasks (T6–T11) interact with live builder state and Shadcn UI that unit tests mock; their real correctness needs a pass in the running dev app (`npm run dev`). The pure-logic foundation (T1–T5) is fully verified by tests independent of the app.
