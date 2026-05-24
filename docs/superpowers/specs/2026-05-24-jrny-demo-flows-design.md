# JRNY Demo Flows — Design

**Date:** 2026-05-24
**Status:** Approved (design) — pending implementation plan
**Owner:** Aadil Aboobaker

## 1. Goal

Provide a small set of **reference/demo flows** that show JRNYFLW acting as the
integration point both ways — JRNY emitting events into JRNYFLW, and JRNYFLW
pushing into JRNY — for the JRNY team and onboarding. The flows are authored and
structurally validated in **dev**, shipped via an **idempotent seed script** that
imports them into any instance (UAT first), and a **consultant wires the
connections** in the target instance.

Audience: JRNY team + onboarding (not yet productized end-customer templates).

## 2. Scope

**Two demo flows:**

1. **Dispatch-ready → courier → response back to JRNY** (round-trip).
2. **Inbound order → JRNY `create_quote`** (into JRNY).

**Deliverables:** the two flow definitions (version-controlled JSON), a seed
script that imports them, a docs index/runbook, and connector feedback notes.

### Out of scope (future, noted only)
- First-class JRNY webhook triggers in the `@jrnyflw/jrny` connector (would replace
  the schedule-poll and the generic Catch Webhook). The connector has **no triggers**
  today.
- Productized, end-customer template library (`manageTemplatesEnabled` is `false` in
  this CE fork; CUSTOM templates are gated).
- Live end-to-end execution in dev against the JRNY dev ERP (validation is structural).

## 3. Key facts (verified)

- **Connector is outbound-only**: 195+ generated actions + `create_quote` + custom API
  call; `triggers: []` (`packages/pieces/custom/jrny/src/index.ts`).
- **JRNY webhook events** (`docs/integrations/jrny/integration-openapi.json` `x-webhooks`):
  `quotation.created`, `sales_order.confirmed`, `shipping.dispatched`,
  `payment.received`, `inventory.stock_alert`. **No `dispatch.ready` event.**
- **Dispatch resource**: `list_dispatch_notes` (GET, filter `status`), `get_dispatch_note`
  (GET, detail with cartons), `courier_response` (**PATCH**, `…/courier-response`).
- **Dispatch status enum**: `draft, awaiting_pack, pack_in_progress, ready_to_dispatch,
  dispatched, invoiced`. "Ready for courier" = **`ready_to_dispatch`**.
- **`courier-response` PATCH defines NO request body in the OpenAPI spec** → the generated
  `courier_response` action is `hasBody:false` and cannot send waybill/tracking back.
- Inbound webhooks today use the core **Catch Webhook** trigger
  (`packages/pieces/core/webhook`, supports None/Basic/Header/HMAC auth, unique URL per flow).
- **CE template gating**: `OPEN_SOURCE_PLAN.manageTemplatesEnabled = false`
  (`packages/shared/src/lib/extras/billing/index.ts`) → seed as **flows**, not templates.

## 4. Approach

**Seed flows directly** (not templates): the seed script creates each flow in a
dedicated **"JRNY Demos"** folder in the target's default project and applies a
`IMPORT_FLOW` operation with the committed flow JSON. Flows land **disabled**; the
consultant creates the required connections, binds the steps, and enables them.

## 5. The two demo flows

### Demo 1 — `dispatch-ready-to-courier`
Purpose: JRNY has dispatch notes ready for courier → JRNYFLW books the courier and
calls the result back into JRNY.

```
Schedule (poll, every 5 min — configurable)     [@activepieces/piece-schedule]
  → JRNY: list_dispatch_notes (status=ready_to_dispatch)   [@jrnyflw/jrny → conn: jrny]
    → Loop on items (dispatch notes)            [LOOP_ON_ITEMS]
       → Dedup gate: skip dispatchNumbers already processed (flow store)
       → JRNY: get_dispatch_note (cartons)                  [conn: jrny]
       → Nucleus: create waybill / parcel packing           [@jrnyflw/nucleus → conn: nucleus]
       → JRNY: custom API call — PATCH …/dispatch-notes/{dispatchNumber}/courier-response
               body: { waybillNumber, trackingUrl, carrier }   [conn: jrny]
```
Notes:
- **Trigger is a schedule poll** because no `dispatch.ready` webhook exists.
- **courier-response uses the custom API call action** (the generated action has no body).
- **Dedup** via the flow `store` keyed by `dispatchNumber` so a note isn't re-couriered
  on the next poll before its status moves off `ready_to_dispatch`.

### Demo 2 — `inbound-order-to-jrny`
Purpose: an external system POSTs an order to a JRNYFLW webhook → JRNYFLW maps it and
creates a JRNY quote.

```
Catch Webhook (flow URL; optional shared-secret header auth)  [@activepieces/piece-webhook]
  → Mapper: map incoming order JSON → JRNY quote shape        [@jrnyflw/mapper]
  → JRNY: create_quote (customerCode, line items, optional auto-convert to SO) [conn: jrny]
  → Return Response (200 + created quote/SO number)
```
Notes:
- Uses the custom **`@jrnyflw/mapper`** piece for the transform (doubles as a mapper showcase).
- The webhook's auth is a static shared-secret header for the demo (documented in the runbook).

## 6. Seed script

`scripts/uat/seed-demos.sh` — curl-based, mirrors `seed-admin.sh` conventions
(depends only on curl/grep/sed; reads admin creds from the target's `.env.uat` env).
Admin sign-in works in CE — `emailAuthEnabled` is a no-op in COMMUNITY edition
(`authentication-utils.ts` returns early for CE) — so the script can authenticate
with the admin password.

Flow:
1. Sign in (`POST /api/v1/authentication/sign-in`) → capture `token` + `projectId`.
2. Ensure the **"JRNY Demos"** folder exists in that project (create if absent; reuse if present).
3. For each demo JSON (`displayName` + `trigger` chain):
   - If a flow with that `displayName` already exists in the folder → skip (idempotent;
     re-import behind a `--force` flag that deletes+recreates).
   - Else create the flow (`POST /api/v1/flows`) and apply `IMPORT_FLOW`
     (`POST /api/v1/flows/{id}`).
4. Print a summary: created/skipped flows + the connection names the consultant must create.

Run modes: against **dev** (validation) and **UAT** (`UAT_BASE_URL`/admin creds). Flows
imported **disabled**.

## 7. Connection contract

Demo flows reference connections by fixed external names:

| Connection name | Piece | Used by |
|---|---|---|
| `jrny` | `@jrnyflw/jrny` | Demo 1, Demo 2 |
| `nucleus` | `@jrnyflw/nucleus` | Demo 1 |

On import the connection-bound steps show **invalid** until the consultant creates these
connections in the target instance and binds them. This is expected and documented.

## 8. Repo layout

```
docs/integrations/jrny/demos/
  README.md                         # runbook/index (per-demo purpose, steps, conns, test payloads)
  dispatch-ready-to-courier.flow.json
  inbound-order-to-jrny.flow.json
scripts/uat/seed-demos.sh           # importer
```

Each `*.flow.json` holds the `IMPORT_FLOW` request shape: `{ displayName, trigger: { …chain… } }`.

## 9. Docs index (`README.md`) contents
- Per demo: purpose, trigger, step list, **required connections + names**, how to test
  (a sample webhook payload to POST to Demo 2; a sample `ready_to_dispatch` dispatch note
  for Demo 1), how to enable.
- **Connector feedback** for the JRNY team:
  1. `courier-response` PATCH should document a request body (waybill/tracking) so the
     generated action can carry it instead of needing the custom API call.
  2. Consider a `dispatch.ready_to_dispatch` (or similar) webhook event so Demo 1 can be
     event-driven instead of polled — and, more broadly, real triggers in the connector.

## 10. Validation (dev)
- Run `seed-demos.sh` against the **dev** instance.
- Confirm both flows import and every step resolves **except** the `jrny`/`nucleus`
  connection bindings (expected invalid until wired).
- No live JRNY/Nucleus calls; no flow enablement.

## 11. Success criteria
- Two flows import cleanly into a fresh instance via one idempotent script.
- A consultant can, with only the README, create the `jrny`/`nucleus` connections, bind
  them, and enable the flows.
- The README clearly states the two connector-feedback items.
