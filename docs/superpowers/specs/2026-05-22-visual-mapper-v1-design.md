# Visual Mapper V1 — Design Spec

| Field | Value |
|---|---|
| Status | Approved for implementation planning |
| Date | 2026-05-22 |
| Supersedes | `docs/audits/VISUAL-MAPPER-DESIGN-V0.md` (V0 inline drag still ships; this spec covers the dedicated step) |
| Companion | Excel/CSV → JRNY Quotations use case; JSON-API ↔ API reshape use cases |
| Out of scope (V1) | Saved templates, expression escape hatch, custom user transforms, OpenAPI operation discovery beyond paste-or-known-URL, mapping diff/merge |

## 1. Goal

Let a flow author **drag fields from one step's output schema onto another step's input schema and produce a runtime transformation** — including N→1 row grouping for bulk-upload patterns. The mapper is a dedicated step that sits between any source and any target, producing a single JSON output consumed by downstream steps via existing `{{steps.X.output}}` mentions.

V0's inline drag-from-data-selector remains for trivial single-field bindings. The dedicated step is where transformation, grouping, and reshape happen.

## 2. Use cases

1. **Excel → JRNY bulk upload.** 100 rows of line items, key column `CustomerPONumber`, 5 unique POs → mapper emits an array of 5 grouped quotation objects with line items collected. Consultant loops the array into JRNY POST.
2. **Third-party API → JRNY.** Vendor portal returns JSON; mapper reshapes to JRNY's request body schema. Header-only mode (single object → single object).
3. **JRNY → external API.** Outbound webhook to an ecom platform; same as use case 2 in reverse.
4. **Mapper → mapper.** Stage 1 normalizes vendor JSON to a canonical shape; stage 2 maps canonical to JRNY. Each mapping is testable in isolation.

## 3. High-level shape

The mapper is a new piece action: **`@jrnyflw/mapper` → `apply_mapping`**. Its config is a declarative mapping spec (pure JSON, versioned). Output is a single JSON value. Runtime is a pure function: `(sourceData, mappingSpec) → output`. No I/O, no side effects, deterministic.

The mapper has three runtime modes, auto-detected from source data + config:

| Source data | Key column? | Mode | Output |
|---|---|---|---|
| Single object | n/a | **Reshape** | Single shaped object |
| Array of rows | No | **Per-row** | Array — one shaped object per input row |
| Array of rows | Yes | **Grouped** | Array — one shaped object per unique key, with line-items collected |

Authors may override the auto-detected mode. The active mode is always surfaced in the UI.

## 4. Architecture & components

### Backend

| Component | Path | Role |
|---|---|---|
| `@jrnyflw/mapper` piece | `packages/pieces/community/jrnyflw-mapper/` | Houses the action and engine |
| `apply_mapping` action | `…/src/lib/actions/apply-mapping.ts` | Thin wrapper that calls the engine |
| Mapping engine | `…/src/lib/engine/` | Pure pipeline: detect-mode → group-and-shape → apply-transforms. Three independently testable stages. |
| Transform registry | `…/src/lib/engine/transforms/` | One file per transform: `{ id, label, paramsSchema (Zod), apply(value, params) → value }` |
| Schema adapters | `…/src/lib/schema-adapters/` | One file per input format. `parse(rawInput) → NormalizedSchema` |
| Spec types | `packages/shared/src/lib/mapper/` | `MappingSpec`, `NormalizedSchema`, `MapperWarning` — exported types versioned via `specVersion` |

The engine is exported from a sub-package so the **UI runs previews in-browser without backend round-trips**. Schema adapters are isomorphic for the same reason.

### Frontend

| Component | Path | Role |
|---|---|---|
| `MapperStepConfig` | `packages/web/src/app/builder/step-settings/mapper/index.tsx` | Step's settings panel; orchestrates sub-views |
| `SchemaAttachBar` | `…/schema-attach-bar.tsx` | Choose target schema source: paste sample / paste JSON Schema / pick from next typed step / paste OpenAPI / known JRNY URL / emergent |
| `MappingCanvas` | `…/mapping-canvas.tsx` | Side-by-side: source tree (left) + target slots (right); hosts the bind-line overlay |
| `BindLineOverlay` | `…/bind-line-overlay.tsx` | SVG layer drawing 2px curved Bezier from leaf → slot for each populated binding; updates on scroll/resize |
| `SourceTree` | `…/source-tree.tsx` | Reuses `DataSelectorTreeNode` and the V0 drag-source machinery |
| `TargetSlotList` | `…/target-slot-list.tsx` | Slots derived from `targetSchema.snapshot` (declared) or built emergently |
| `TransformPicker` | `…/transform-picker.tsx` | Popover on a populated slot; lists built-in transforms, configures params |
| `PreviewPane` | `…/preview-pane.tsx` | Runs engine against last upstream sample data; shows output + warnings live |

### Built-in transform library (V1)

`trim`, `lowercase`, `uppercase`, `default`, `concat`, `split`, `regex_extract`, `date_format`, `parse_number`, `lookup`. Registry pattern — adding one is a single new file.

### Schema adapters (V1)

| Adapter | Input | Notes |
|---|---|---|
| `json_sample` | Raw JSON example | Infer types from values |
| `json_schema` | JSON Schema document | Direct |
| `xml` | XML sample | `fast-xml-parser`; element ↔ object, attributes preserved |
| `html_table` | HTML fragment | Parse `<thead>` for columns; first `<tbody>` row for type inference |
| `csv` | CSV/TSV with header | Header row → fields; first data row → types |
| `xlsx` | XLSX file | First sheet, first row → fields. Reuse parser from `@jrnyflw/excel` |
| `piece_schema` | Reference to next step's action | Auto-attach when next step is typed (especially `@jrnyflw/jrny`) |
| `openapi` | OpenAPI/Swagger spec + operation ref | Paste spec → pick path + verb → extract request body schema. JRNY: auto-load from known URL when project has JRNY connection. |

All adapters output the same internal **NormalizedSchema** shape (essentially JSON-Schema-like). UI and engine only ever see the normalized form.

## 5. The mapping spec

```json
{
  "specVersion": 1,
  "mode": "auto",
  "groupBy": ["CustomerPONumber"],
  "targetSchema": {
    "source": "openapi",
    "ref": "JRNY:POST /quotations#requestBody",
    "snapshot": { /* NormalizedSchema */ }
  },
  "fields": [
    {
      "target": "customer.po_number",
      "binding": { "kind": "header", "source": "CustomerPONumber" }
    },
    {
      "target": "customer.name",
      "binding": { "kind": "header", "source": "CustomerName", "transforms": [{ "id": "trim" }] }
    },
    {
      "target": "lines",
      "binding": {
        "kind": "line_collection",
        "items": [
          { "target": "product_code", "binding": { "kind": "row", "source": "SKU" } },
          { "target": "quantity",     "binding": { "kind": "row", "source": "Qty", "transforms": [{ "id": "parse_number" }] } },
          { "target": "unit_price",   "binding": { "kind": "row", "source": "Price", "transforms": [{ "id": "parse_number" }] } }
        ]
      }
    }
  ]
}
```

Three binding `kind`s:
- **`header`** — one value per group (scalar fields in grouped mode; equivalent to `row` in reshape/per-row mode)
- **`row`** — value from the current row (per-row mode, or items inside a `line_collection`)
- **`line_collection`** — recursive; a target array whose items are themselves mappings against the rows of the current group

`mode: "auto"` resolves at runtime from `sourceData` type + presence of `groupBy`. Explicit mode overrides auto-detection.

`targetSchema` is optional. When absent, the mapper operates in **emergent** mode — author adds output fields one at a time; the snapshot is inferred from the mapping itself. When present, side-by-side mode is enabled and the target slots reflect the snapshot.

## 6. Runtime pipeline

`(sourceData, mappingSpec) → { output, warnings }`

1. **Detect mode** (if `"auto"`): inspect `sourceData` type + presence of `groupBy` → resolves to `reshape | per_row | grouped`.
2. **Partition** (grouped only): bucket source rows by composite `groupBy` key. Validate header fields agree across rows in a group; warn if not, take first value.
3. **Shape**: walk `fields[]`. For each `binding`, evaluate against the current context (group / row / single object), apply transforms in declaration order, set the value at `target` path. Missing source fields → warning + `null`; transform throws → warning + `null`. Mapping continues regardless.
4. **Validate** (if `targetSchema.snapshot` present): run output through the snapshot. Validation failures surface as warnings; downstream step still receives the output. Hard-fail validation is opt-in per step (V1.x).

## 7. Visual bind-lines (hard V1 requirement)

The `MappingCanvas` overlays an SVG layer that draws a 2px curved Bezier from each source-leaf row to its bound target slot. Lines update on:
- Drag-end (new binding created)
- Slot edit (binding changed)
- Scroll of either side
- Window/panel resize

Color encodes state: neutral grey for valid bindings, amber when the binding's source is missing from the latest sample data, red when transforms produce a warning during preview.

## 8. Errors

### Runtime (engine)

| Condition | Behavior |
|---|---|
| Missing source field | Warning, write `null`, continue |
| Transform throws | Warning, write `null`, continue |
| Output fails target validation | Warning surfaced on step output, downstream still receives output |
| Empty source array in grouped mode | Output `[]`, no warning |
| Header-fields disagree across rows in a group | Warning, take first value, continue |

### Design-time (UI)

| Condition | Behavior |
|---|---|
| Schema attach fails to parse | Inline error on attach bar; side-by-side mode does not engage |
| Drag onto incompatible slot type | Drop rejected with tooltip; slot unchanged |
| Misconfigured binding visible in preview | Inline warning on the slot + warning row in preview pane |

The preview pane is the safety net — every misconfiguration is visible against real sample data before the flow is saved.

## 9. Testing

- **Engine** — pure functions, 100% Vitest unit coverage. Table-driven: `{ name, sourceData, mappingSpec, expectedOutput, expectedWarnings }`. All three modes × every binding kind × every transform × every error condition.
- **Schema adapters** — one Vitest file per adapter. Inputs → NormalizedSchema.
- **Piece action** — integration test via `test-api` harness. End-to-end `apply_mapping` against a fixture upstream step.
- **UI** — Vitest + React Testing Library for `MapperStepConfig` and sub-components. Bind-lines validated via SVG path-string snapshots (not pixel snapshots).

## 10. White-labelling & edition safety

Per CLAUDE.md: all user-facing copy in the mapper must be i18n keys (no raw English in Zod messages or labels). The mapper ships in CE — no edition gating required. The piece is open-source under the standard pieces directory.

## 11. Scope guardrails — explicitly OUT of V1

- Saved mapping templates / template registry → V1.1
- Expression escape hatch (per-field Mustache) → V1.2
- Custom user-defined transforms → V1.2+
- Multi-column composite-key picker UI (spec supports arrays; UI is single-column in V1)
- OpenAPI operation discovery from a remote registry → V1.x (paste + known JRNY URL only in V1)
- Mapping diff / merge tooling → V2
- Bidirectional sync between raw spec view and visual canvas → V2 (visual is authoritative in V1)
- GraphQL adapter → deferred indefinitely (covered by dedicated pieces, per design conversation)

## 12. Open follow-ups (not blocking implementation)

- Confirm location of the JRNY OpenAPI spec (URL or repo path) so the auto-attach for JRNY-bound mappers can be wired.
- Decide whether `@jrnyflw/mapper` is a community piece or a core piece under `packages/pieces/core/`. Default: community.
- Confirm the V0 inline drag-and-drop and the new dedicated step coexist cleanly in step-settings (V0 lives in the form-field input; V1 lives in its own step config — no overlap expected).
