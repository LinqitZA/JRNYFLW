# Visual Drag-to-Link Field Mapper — Design v0

| Field | Value |
|---|---|
| Status | **V0 shipped (commit 39f63d6)** — V0.5 + V1 pending UX iteration |
| Date | 2026-05-06 |
| Companion | Excel/CSV → Quotations use case (integration plan §2.1A) |
| Out of scope | AI/auto-mapping, transform expressions, conditional mapping, validation rules |

## 0. Status & What Ships Today

**V0 (commit `39f63d6`) — drag-from-source-tree → drop-on-form-field.**

Each insertable leaf in the data-selector tree is now a drag source with a `GripVertical` handle. Every `<TextInputWithMentions>` is a drop target. Dropping a source onto a field replaces the field's value with a single `{{<source path>}}` mention chip — same expression syntax as click-to-insert, no runtime change. Compatible drag in progress shows a light primary-colour ring on every drop target; the actual hover target shows a heavy ring. 1:N fan-out works for free since each drop is independent.

DnD library: react-dnd@16 with HTML5Backend (MIT). Wrapper at builder root.

**Not yet shipped — what answers from the user did NOT translate into code in this session:**

| User answer | What it implies for code | Why deferred |
|---|---|---|
| Always-on mapper with side-by-side layout | Restructure `step-settings/index.tsx` from vertical-panels to horizontal split | Highest UX risk; needs your eye on the resize/scroll behaviour and the empty-state-when-no-sample-data UX |
| react-dnd | ✅ Done in V0 |  |
| Curved Bezier 2px lines | SVG overlay component | Without side-by-side layout, lines would cross the viewport between floating panels — visually noisy. Couples to layout decision above. |
| Type compatibility hints | Thread `targetType` prop through auto-form-field-wrapper → TextInputWithMentions; map PieceProperty.type → FieldValueType | The prop-drilling pattern needs your eye — a plain prop pass vs. context vs. metadata-via-hook are three different idioms |
| Partial-expression fallback | Detect non-single-mention values, render different drop affordance | Requires the side-by-side layout to be in place first |
| Per-element array→array mapping | New compile step lowering `{ source, items: [...] }` to `loop-on-items` | Real product feature, separate spec needed |
| 1:N fan-out | ✅ Works for free in V0 (each drop is independent) |  |

---

## 1. Why

JRNYFLW's current step-settings UX edits each prop as a Tiptap rich-text input where authors interleave literal text with **mention chips** that resolve to `{{steps.X.output.Y}}` expressions at runtime. The chip itself is a Tiptap node rendered with a step-icon + path label.

To bind a source field to a target field today, the author:

1. Clicks the target prop's input (giving it focus).
2. Opens the data-selector panel.
3. Clicks the source-tree leaf they want.
4. The leaf's `propertyPath` is wrapped in `{{...}}` and inserted as a chip.

This works, but it's prop-by-prop, focus-based, and gives no overview of "which source fields are bound to which targets". For Excel/CSV ingest where ~10–30 column-to-prop bindings are common, it's tedious and error-prone.

The visual mapper presents both schemas side-by-side, lets the author **drag** from a source field to a target field, and renders **lines between bound pairs** so the wiring is visible at a glance. Behind the scenes it produces the same `{{...}}` Mustache expressions — no runtime change.

## 2. What Already Exists (Reusable)

| Component | Path | Role |
|---|---|---|
| `DataSelector` panel | `packages/web/src/app/builder/data-selector/` | Left-side source schema tree (built from step sample data) |
| `DataSelectorTreeNode` shape | `data-selector/type.ts` | `{ key, data: { type: 'value' \| 'chunk' \| 'test', propertyPath, displayName }, children? }` — already the right model |
| Tree builder | `data-selector/utils.ts` | Walks step sample-data → tree of `propertyPath`s with chunked grouping |
| Mention insertion | `text-input-with-mentions/index.tsx:117` | `insertMention(propertyPath)` wraps as `{{...}}` and inserts as Tiptap node |
| Focus-based target | `setInsertMentionHandler` in `useBuilderStateContext` | The mention goes to whichever `<TextInputWithMentions>` is currently focused |
| Auto-form rendering | `piece-properties/auto-form-field-wrapper.tsx` | Renders each piece prop with React Hook Form binding; `form.setValue(propName, value)` is the universal write path |
| Step settings panel | `step-settings/index.tsx` | Hosts the auto-form for the currently-selected step |
| Sample data hooks | `features/flows/hooks/sample-data-hooks.ts` | Loads upstream sample data for schema inference |

**This is excellent foundation.** The mapper doesn't need new persistence, expression syntax, or runtime — it's a UI on top of `setValue('{{path}}')`.

## 3. Scope Tiers

### 3.1 V0 — Single-prop drag binding (1–2 days)

Smallest meaningful slice. Drag a source leaf onto a target prop input → that prop becomes a single mention chip. No SVG lines yet, no array-of-array.

**Deliverables:**
- Drag-source on `DataSelectorNodeContent` leaves
- Drop-target on `<TextInputWithMentions>` (replaces existing input, mention becomes the entire value)
- Visual feedback: drag preview chip; drop-target highlight
- Existing click-to-insert still works (additive feature)

**What it does NOT do yet:**
- No bind-line visualization
- No two-column visual layout
- No array iteration mapping
- Doesn't support partial expressions (drag-into-middle-of-text)

### 3.2 V1 — Side-by-side mapping panel + bind-lines (3–5 days)

The full "two columns + lines" experience as you described.

**Deliverables:**
- New "Mapping" tab/mode in step-settings (toggle from current "Form" mode)
- Left column: source schema tree (existing data-selector, restyled for the panel)
- Right column: target schema = current step's flat list of props
- SVG overlay drawing curved lines between bound source paths and target prop names
- Click a line → highlight bound prop, "Unbind" action
- Hover a target → highlight all source candidates of compatible type
- Persists exactly as v0 (single mention per target prop = whole-value binding)

**Hard UX questions for you:**
1. Does "Mapping" mode replace or coexist with "Form" mode? Toggle, or split-view?
2. Lines drawn through what space — between the tree (left) and a vertical list of prop names (right)? Curved? Straight?
3. What about props that need *partial* expressions like `"Hi {{firstName}}, your invoice is..."`? V1 doesn't handle these — they fall back to Form mode.
4. Should bound state on a prop look like: a chip (current Tiptap rendering), a "🔗 firstName ← rows.firstName" pill, or something else?

### 3.3 V2 — Array-of-array iteration mapping (1–2 weeks)

The "data coming from one step's array → target step's array, mapping element-by-element" case you mentioned.

**Concrete example:** `excel.read_xlsx_rows` outputs `rows: [{ customerCode, stockCode, qty }]`. Downstream `jrny.create_quote` takes a `lines[]` prop where each line is `{ stockCode, qty, unitPrice? }`. The user wants:

> "For each row in `excel.rows`, create a `lines[]` entry with `stockCode = row.stockCode`, `qty = row.qty`."

This is currently expressed by wrapping the destination in a `loop-on-items` step that iterates `excel.rows` and inside the loop, reference `loopItem.stockCode` etc. Functional but not visual.

V2 would let you draw a single "iterate" line from the source array node to the target array prop, then bind child fields:

```
left:  rows[]           right:  lines[]
       ├─ customerCode          (no field-level bind needed for header context)
       ├─ stockCode    ────►    ├─ stockCode
       ├─ qty          ────►    ├─ qty
       └─ ...                   └─ unitPrice  (left blank → pricing engine resolves)
```

**Persistence questions for v2:**
- Compile to nested `loop-on-items` + per-iteration bindings (zero runtime change)? Or
- New first-class `array_mapping` field type stored as `{ source, items: [{ targetField, sourceField }] }` and run by a new mapping engine?

Option 1 is much safer (reuses existing runtime). Option 2 is cleaner but introduces new engine code, validation, error paths.

V2 is a real feature spec of its own — should be brainstormed separately before implementation, not folded into v0/v1.

## 4. Technical Component Breakdown (V1)

| New file / change | Purpose |
|---|---|
| `packages/web/src/app/builder/mapping/index.tsx` | New panel host. Controls Form ↔ Mapping mode toggle. |
| `packages/web/src/app/builder/mapping/source-tree.tsx` | Wraps existing `DataSelector` styling for the left column (probably a thin reuse). |
| `packages/web/src/app/builder/mapping/target-list.tsx` | Renders current step's props as a vertical list with drop zones, derived from the same auto-form metadata. |
| `packages/web/src/app/builder/mapping/bind-lines.tsx` | SVG overlay. Computes line endpoints from DOM rects of source/target items via refs + `getBoundingClientRect`, redraws on scroll/resize. |
| `packages/web/src/app/builder/mapping/use-bindings.ts` | Hook that reads current prop values, parses any single-mention `{{...}}` expressions back to `{ targetProp, sourcePath }` pairs for line rendering. |
| `step-settings/index.tsx` | Add the toggle + render `<MappingPanel>` when active. |
| `data-selector-node-content.tsx` | Add `draggable` + `onDragStart` to leaves, alongside existing click handler. |
| `auto-form-field-wrapper.tsx` | Add `onDrop` handler: parse dropped path, call `form.setValue(propName, '{{path}}')`. |
| `useBuilderStateContext` | Add `mappingMode: 'form' \| 'mapping'`, `setMappingMode`. |

**No backend changes.** No new flow-definition fields. No new runtime engine.

## 5. UX Questions That Block Implementation

I cannot make these calls without you. Ordered by importance:

1. **Mode model.** Toggle between Form/Mapping (most users use Form, mapper is a power tool) vs. always-on split view (mapper is the primary UX, form is a fallback for partial-expression props)? **Recommendation:** toggle. Power tool that doesn't disrupt existing UX.

2. **Drag affordance.** Pure HTML5 drag-and-drop (browser-native, simple, but limited visual control), or react-dnd (richer, library cost), or motion-based (Framer Motion) drag (smoothest visuals)? **Recommendation:** HTML5 for v0, revisit if v1 needs richer feedback.

3. **Line rendering style.** Straight, curved Bezier, orthogonal "subway" routing? Active vs unbound prop emphasis? **Recommendation:** curved Bezier, 2px, primary colour. Hover thickens to 3px and surfaces an "Unbind" chip.

4. **Type compatibility hints.** When a user starts dragging a `string` source, should `number` props dim? **Recommendation:** v1 = no type checking (Mustache stringifies anyway). v1.5 = soft hints.

5. **Empty-state copy.** "Drag a source field on the left to a target prop on the right to start mapping." Standard Shadcn/Tailwind. **No question, I'll write it.**

6. **Partial-expression fallback.** A prop currently containing `"Hello {{name}}!"` — show in mapper as bound (lossy preview), or grey-out with "edit in Form mode"? **Recommendation:** grey out with "Form mode" CTA. Preserves the expression, no foot-guns.

7. **Array prop UX in v1 (before v2).** Pre-v2, an array-typed target prop in the mapper accepts a single mention to "the whole array" — the existing AP semantic. The per-element mapping comes in v2. Does that match your mental model? Need confirmation.

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Conflict with focus-based mention insertion | Medium | Keep both modes additive — drag works in mapping mode only, click-insert remains in form mode |
| Sample-data unavailability for unsynced steps | Medium | Show "Test the source step first" placeholder in the source column (existing pattern) |
| Re-render storm when SVG redraws on every keystroke | Low–Medium | Debounce + only redraw on scroll/resize/binding-change |
| Tiptap state vs RHF state drift | Medium | Read from RHF as source of truth; never bypass `form.setValue` |
| Breaks accessibility (drag is poor a11y) | Medium | Keep existing keyboard-friendly tree-click flow; drag is enhancement only |
| Visual mapper distracts from existing flow builder Q1 polish | Low | This is in its own toggle, doesn't change default UX |

## 7. Recommended Path

Phase split, in order:

1. **Brainstorm session with you** — walk through the UX questions in §5, agree on mode model (toggle vs split), agree on V1 scope freeze.
2. **V0 build** — single-prop drag binding, no two-column UI yet. ~1–2 days. Fast feedback. Catches the focus-conflict and sample-data-unavailable edge cases early.
3. **V1 build** — full two-column + lines. ~3–5 days. By now the foundational drag works.
4. **V2 brainstorm + spec** — array-of-array mapping is a real feature, not v1 scope. Worth its own design doc once V1 ships.

Total to land V1: probably **1 calendar week** with iterative review. V2 adds another 1–2 weeks.

## 8. What Was Built and What Wasn't (Session of 2026-05-06)

**Built and committed:**
- V0 drag/drop plumbing (commit `39f63d6`)
- DnD library wired in (`react-dnd@16` + `react-dnd-html5-backend@16`)
- Drag-source on data-selector tree leaves
- Drop-target on every `<TextInputWithMentions>` field
- Visual feedback (rings on drop targets during drag)
- Compatible-with-existing-UX: click-to-insert still works
- DOM data-attributes (`data-jrny-mapping-source`, `data-jrny-mapping-target`) ready for V0.5 SVG bind-line positioning

**Deliberately NOT built solo (deferred to next session):**

1. **Side-by-side layout** in step-settings. The current builder has a vertical-panels resizable layout in step-settings; restructuring to horizontal split is the highest-risk UX change because:
   - Empty-state when no upstream sample data exists needs an opinion
   - Mobile/narrow-screen behaviour needs an opinion
   - Whether the source panel scrolls independently from the target form needs an opinion
   - Resize handle position + min/max widths need opinions
   I'd be guessing on each of these.

2. **SVG bind-lines.** Without side-by-side layout, lines would have to cross the viewport from the floating data-selector to the right sidebar — technically possible but visually busy. Layout decision must come first.

3. **Type compatibility hints.** `dnd-types.ts` already has `inferValueType` and `valueTypesCompatible` helpers, and `FieldPathDndItem` already carries `valueType`. What's missing is threading the *target* prop's type through the form to the drop component. Three reasonable patterns (prop drilling vs. React context vs. property-from-hook) each affect future props differently — worth your eye.

4. **Partial-expression fallback.** Coupled to layout work.

5. **Per-element array→array mapping.** This is a real V1 feature with its own technical spec (compile to `loop-on-items` vs. new mapping engine). Brainstorm separately.

## 9. Next Session Hand-Off

Order of operations when we resume:

1. **(15 min) UX walkthrough** — open `localhost:4200`, open a flow, drag a leaf from the data-selector to a step's prop. Confirm it works. React to ring colours, drag handle visibility, opacity-while-dragging behaviour.

2. **(30 min) Side-by-side layout decision** — answer: empty-state copy, scroll behaviour, resize handle, narrow-screen fallback. Write decisions in a comment block at top of the new layout component.

3. **(2–3 hours) V0.5 build** — restructure step-settings, add type compat threading, ship SVG bind-lines.

4. **(separate session) V1 brainstorm** — per-element array mapping spec.

The V0 commit is safe to revert in isolation if any of the above changes the foundation.

---

*End of design v0.*
