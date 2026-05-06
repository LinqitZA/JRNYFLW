# JRNY ↔ JRNYFLW Smoke Test Playbook

| Field | Value |
|---|---|
| Status | Ready to run when JRNY-side v0b is up |
| Date | 2026-05-04 |
| Segment under test | `@jrnyflw/jrny` v0.0.1 |
| JRNY-side spec | `JRNY-SIDE-INTEGRATION-SPEC-V0.md` (v0b scope per JRNY dev team) |
| Scope | Single-instance smoke test (two-instance import test deferred) |

---

## 1. What This Test Proves

A static-payload flow in JRNYFLW, triggered by a webhook, calls a real JRNY endpoint (full-fidelity adapter — pricing engine, tax, UOM, etc.) and creates a real quotation in JRNY's database. Plus the export side-channel: the exported flow JSON contains a connection *reference*, never a literal bearer token.

If this works, the integration model in `jrnyflw-integration-plan.md` is validated end-to-end. Every other surface (state triggers, MCP, button-trigger UX) builds on the same auth + path-scoping pattern.

## 2. Pre-flight Requirements

### From the JRNY team

- A JRNY dev instance running and reachable from the JRNYFLW container (or running on the same host).
- The integration v0b endpoint live: `POST /v1/integration/entities/:entityId/quotations`.
- A seeded entity (suggested: `ZA01`).
- One seeded customer (suggested: `ACME001`) and at least two seeded stock items (suggested: `WIDGET-RED-LG`, `WIDGET-BLUE-LG`).
- A bearer token issued for the seeded entity. **Plaintext — copy once, paste into JRNYFLW connection. Do not commit to any repo.**

Capture these four values for the next steps:

```
JRNY_BASE_URL    = http://<host>:<port>/api
JRNY_ENTITY_ID   = <uuid>
JRNY_ENTITY_CODE = ZA01
JRNY_TOKEN       = <plaintext token>
```

### From the JRNYFLW side

- Repo on a branch with `packages/pieces/custom/jrny/` present (built via the steps below).
- JRNYFLW dev stack running (api + frontend + worker + postgres + redis).

## 3. Build the Segment

```bash
cd /home/linqadmin/repo/jrnyflw
bun install                                                          # populate workspace symlinks
bunx turbo run build --filter=@jrnyflw/jrny         # tsc → dist/
```

Expected: green build, output under `packages/pieces/custom/jrny/dist/`.

## 4. Restart JRNYFLW Dev So the Segment Is Discovered

JRNYFLW's piece loader walks `packages/pieces/` at startup, **but in dev mode it only exposes pieces listed in `AP_DEV_PIECES`**. The segment must be in that list under its stripped package name (`jrny`, matching the directory name). Two lookups depend on this string:

- **dev-piece-watcher** matches the *directory basename*.
- **worker piece-installer** matches `getPieceNameFromAlias(packageName)` — for `@jrnyflw/jrny`, that's `jrny`. If this name is missing from `AP_DEV_PIECES`, the installer tries to npm-install the package and the engine's auth-validation step returns `ENGINE_OPERATION_FAILURE / 404`.

In `.env.dev`, append `jrny` to `AP_DEV_PIECES`:

```
AP_DEV_PIECES=google-sheets,store,webhook,jrny
```

Also confirm `turbo.json` has `"globalEnv": ["AP_DEV_PIECES"]` at the top level — without it, Turbo 2.x sandboxes the env var away from sub-tasks.

```bash
# stop any running dev stack, then:
bun run dev
```

Tail the api logs for the dev-pieces banner and watcher confirmations:

```
[WARNING]: This is only shows pieces specified in AP_DEV_PIECES google-sheets,store,webhook,jrny ...
Watching for changes: jrny
```

**Pass criteria:**
- The banner above shows the segment in the list.
- `GET http://localhost:3002/api/v1/pieces` returns 4 entries including `@jrnyflw/jrny`.
- Segment appears in the JRNYFLW UI's piece picker as "JRNY".
- Saving a connection succeeds (no 400 with `bun install ... 404` in the engine error).

## 5. Create a Connection

In the JRNYFLW UI:

1. Settings → Connections → New connection.
2. Pick "JRNY".
3. Paste the four pre-flight values:
   - **Base URL** → `JRNY_BASE_URL`
   - **Entity ID** → `JRNY_ENTITY_ID`
   - **Entity Code** → `JRNY_ENTITY_CODE`
   - **Bearer Token** → `JRNY_TOKEN`
4. Connection name suggestion: `JRNY — Smoke / ZA01` (the convention from the integration plan §3.3).
5. Save.

**Pass criteria:** connection saves without error. Activepieces typically calls a validation hook on save — if JRNY's auth model rejects, you'll see the error here.

## 6. Build the Test Flow

In JRNYFLW UI:

1. Flows → New flow → Name: `Smoke — Create Quote from Webhook`.
2. **Origin (trigger):** Webhook (catch hook) — note the unique webhook URL JRNYFLW generates; you'll curl this in step 7.
3. **Destination (action):** "JRNY" / `create_quote`.
   - Bind to the connection from step 5.
   - **Customer Code:** `ACME001`
   - **Lines:**
     ```
     [
       { stockCode: WIDGET-RED-LG,  qty: 10 },
       { stockCode: WIDGET-BLUE-LG, qty: 5  }
     ]
     ```
     Leave `unitPrice` and `uom` blank — pricing engine will resolve.
   - **Notes:** `Smoke test 2026-05-04`
   - **External Reference:** `FLOW-SMOKE-001`
   - **Delivery Address:** `Use customer default`
   - **Auto-convert to Sales Order:** unchecked (v0a path); flip to checked once JRNY v0b is confirmed working.
4. Publish the flow.

## 7. Trigger and Verify

```bash
curl -X POST '<webhook-url-from-step-6>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Watch in parallel:

| Window | What to verify |
|---|---|
| JRNYFLW UI → Runs | Run completes with status `Succeeded`. Click into the run; the `create_quote` step's output should be the JRNY response object — `{ id, quoteNumber, status, totals, links, ... }`. |
| JRNY UI → Sales → Quotations | A new quotation appears with customer `ACME001`, the two stock lines, and external reference `FLOW-SMOKE-001`. |
| JRNY API logs | The integration request was received with `apiKeyId` populated, `tenantId`/`entityId` matching the seeded entity, and a `2xx` response. |

**Pass criteria:** all three windows are green. The quoteNumber in JRNYFLW's run output matches the quote number visible in JRNY UI.

### Negative test (entity-mismatch, recommended but optional)

If you have a second seeded entity, briefly edit the connection's `Entity ID` to that second entity's UUID and re-trigger the flow. Expected: the action throws `JrnyApiError` with `errorCode: ENTITY_MISMATCH`, HTTP 403. This proves the JRNY-side guard is honouring the path/token binding.

Restore the original entity ID afterward.

### Negative test (bad stock code)

Edit the flow's `lines` to include a non-existent `stockCode` like `WIDGET-PURPLE`. Re-trigger.

Expected: `JrnyApiError` with `errorCode: STOCK_ITEM_NOT_FOUND` and `details.lines` showing the offending index/code (per the multi-error envelope from the JRNY spec). Confirms the structured-error path works end-to-end.

Revert the line afterward.

## 8. Export and Verify Placeholders

In JRNYFLW UI:

1. Open the flow → … menu → Export → download JSON.
2. Inspect:

```bash
# The bearer token value MUST NOT appear in the export
grep -F '<your-bearer-token>' /path/to/flow-export.json && echo "FAIL: token leaked" || echo "OK: token absent"

# The connection should be referenced by its connection ID / external ID, not by literal creds
jq '.. | select(.type? == "CONNECTION_VALUE")? | .' /path/to/flow-export.json
# expected: an object with connectionId / externalName, not bearerToken/baseUrl
```

**Pass criteria:**
- `grep` for the literal token string returns nothing.
- The action's auth field references a connection by ID (or external name), not by inline value.
- `baseUrl` and `entityCode` *may* appear (they're not secret) — that's fine, they help a human re-importer see what they're rebinding.

This is the property the test is meant to confirm. If the token survives the export, the export pipeline is broken and we have a security incident, not a smoke-test pass.

## 9. Capture Results

Append to this playbook (or to a session-progress doc) under "Run history":

```
Run #1 — 2026-05-XX
  Operator: <name>
  JRNY commit: <sha>
  JRNYFLW commit: <sha>
  Quote created: Q-2026-XXXXX (link)
  External ref: FLOW-SMOKE-001
  Negative test (entity-mismatch): PASS / FAIL / SKIP
  Negative test (bad stock code): PASS / FAIL / SKIP
  Export-placeholder check: PASS / FAIL
  Notes: ...
```

## 10. After v0a Passes — Switch to v0b

When the JRNY team confirms the delivery-address schema migration is in and `autoConvert` is wired:

1. Edit the flow → set **Auto-convert to Sales Order** = checked.
2. Add a **Delivery Address** = Inline custom address — populate at least Address Line 1 and City.
3. Re-trigger.
4. Verify the run output now includes a `salesOrder` object with its own `orderNumber`, `status: Draft`, and `links`.
5. Verify in JRNY UI: the quotation status is `Converted` and a new draft sales order exists, both carrying the snapshot delivery address.

This is the v0b acceptance test. After it passes, the "thin slice" is complete and the next deliverables (state triggers / outbound webhook dispatcher, then MCP) can start.

## 11. Out of Scope For This Smoke Test

- Two-instance export/import (deferred — same export format will be used when we revisit).
- Vocabulary alias wrapper (`@jrnyflw/segments-framework` with `createSegment` / `createDestination` / `createOrigin`) — Phase 4.x.
- Idempotency (`X-Idempotency-Key`) — JRNY-side optional in v0b; segment doesn't send it yet. Add after v0b passes.
- API key management UI in JRNY — manual SQL insert is fine for v0.

## 12. Failure Triage Hints

| Symptom | Likely cause |
|---|---|
| Segment doesn't appear in piece picker | Build didn't run; or dev server wasn't restarted; or `tsconfig.base.json` paths entry missing; or `jrny` not in `AP_DEV_PIECES`; or `globalEnv` missing from `turbo.json`. |
| Connection save returns 400 with `ENGINE_OPERATION_FAILURE` and `bun install ... 404` | Segment package name's stripped form (`jrny`) is not in `AP_DEV_PIECES`. The installer is treating it as a registry piece and trying to fetch from npm. Add the stripped form to `AP_DEV_PIECES` and restart. |
| Connection saves but flow run fails with `INVALID_TOKEN` | Token wasn't pasted exactly; or token revoked; or hash algorithm mismatch between issue script and guard. |
| Flow run fails with `ENTITY_MISMATCH` immediately | The token was issued against a different entity than the one in the connection's `Entity ID` field. |
| Flow run fails with `CUSTOMER_NOT_FOUND` | Customer `ACME001` not seeded in the bound entity. JRNY-side seed step skipped. |
| Flow run fails with `PRICE_NOT_FOUND` | Stock item exists but no active price list / contract / list price. JRNY pricing engine has nothing to resolve. Add a price or pass `unitPrice` in the line. |
| HTTP 500 from JRNY without an error envelope | JRNY's integration adapter is throwing before the error handler maps to the envelope. Check JRNY API logs by `requestId`. |
| Token visible in exported flow JSON | **Stop the smoke test.** Investigate the JRNYFLW export pipeline before continuing. The encryption-at-rest contract is broken. |

---

*End of playbook.*
