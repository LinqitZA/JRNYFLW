# AON Customer Portal piece

Date: 2026-10-13
Package: `@jrnyflw/aon-portal` (new), plus a small change to `@jrnyflw/piece-trace`

## Why

AON gives some customers their own ordering portal, where the customer's staff place authorised orders. The first is Shoprite's, at `https://shoprite.accessoffice.co.za`. Orders placed there need to reach JRNY, and the portal needs to know JRNY's order number once JRNY has the order.

This piece lets a flow read those orders and acknowledge them. It is not the `@jrnyflw/shoprite` piece, which talks to Shoprite's own B2B system (GS1 EDI). The two must not be confused.

## Goals

1. A flow can list a portal's orders by status, with every page fetched.
2. A flow can acknowledge an order with the ERP order number.
3. The same piece works for every AON customer portal. Each portal is a connection, not code.
4. The piece behaves like our other pieces: it shows the calls it sent, has the "If the call fails" setting, and never reveals the API key.

## Out of scope

- The flow that creates the order in JRNY. It gets its own spec and uses the existing JRNY actions (create quote, convert quote to sales order, confirm sales order). That spec must cover mapping `companyCode` to a JRNY customer, `productSku` to JRNY items, VAT, and what happens when JRNY has the order but the acknowledge call failed. Agreed for that flow so far: a Schedule trigger, once a day to start with.
- A polling trigger. A daily scheduled flow with List Orders was chosen instead (see Decisions).

## The portal API

Given by the portal team, and probed read-only against the live Shoprite portal on 2026-10-12. Acknowledge was not called, because the orders are live.

| Call | Request |
| --- | --- |
| List orders | `GET /api/erp/orders?status=<status>&page=<n>&limit=<n>` |
| Acknowledge | `PUT /api/erp/orders/<id>/acknowledge` with JSON `{"erpOrderNumber": "<number>"}` |

Auth is an `X-API-Key` header. A missing or wrong key returns 401 `{"error": "API key required", "message": "..."}`.

List response:

```
{ orders: [...], pagination: { page, limit, total, totalPages } }

order
  id               uuid, used in the acknowledge URL
  orderNumber      10001, the number people see
  status           "processing"
  companyCode      "S0001", differs per order
  total            488.44, equal to the sum of lineTotal
  orderNotes       string or null
  erpOrderNumber   null until acknowledged
  createdAt, updatedAt   ISO timestamps
  customer         { id, username, firstName, lastName, email, companyCode, phone?,
                     address { line1?, line2?, city?, stateProvince?, postcode?, country } }
  items[]          { id, productId, productName, productSku, quantity, unitPrice,
                     lineTotal, variantId? }
```

Observed behaviour:

- `limit` defaults to 50; `page` and `limit` both work.
- Statuses that return 200: `processing`, `acknowledged`, `completed`, `cancelled`, `shipped`, `on_hold`. An unknown status returns 500 `{"error": "Failed to retrieve orders"}`.
- With no `status`, the portal returned the same orders as `processing`.

## Design

### Connection

`PieceAuth.CustomAuth` with:

- **Portal URL**: for example `https://shoprite.accessoffice.co.za`. A trailing slash is ignored.
- **API Key**: a secret.

Saving a connection calls `GET /api/erp/orders?status=processing&limit=1`. A 401 fails validation with "The portal rejected this API key". Any other failure fails it with the status and the portal's message.

### Actions

**List Orders**

- **Status**: dropdown, default `processing`. Options are `processing`, `acknowledged`, `completed`, `cancelled`, `shipped` and `on_hold`.
- The action requests pages of 50 until it reaches `totalPages`, and returns `{ orders, total }`: the orders from every page, in the order the portal gave them, and the portal's `total`.
- It stops after 100 pages and fails with "More than 5,000 orders with status <status>; narrow the status or ask for a date filter". The portal can't loop it forever.
- No orders gives `{ orders: [], total: 0 }`, not a failure.

**Acknowledge Order**

- **Order ID**: the order's `id`. If it isn't a UUID, the action fails before calling the portal: "Order ID must be the order's id (a UUID), not its orderNumber". Passing `orderNumber` by mistake is the easiest error to make in a flow.
- **ERP Order Number**: required, trimmed.
- It sends `PUT /api/erp/orders/<id>/acknowledge` with `{"erpOrderNumber": "<number>"}`, and returns the portal's response body.

**Custom API Call**

`createCustomApiCallAction`, with the Portal URL as its base and the `X-API-Key` header added automatically.

### Shared behaviour

- List Orders and Acknowledge Order return `{ ok, sent, output }` through `pieceTrace.run`, and have the "If the call fails" setting.
- `secretsOf(auth)` returns `[apiKey]`, so the key is scrubbed from `sent` and from error messages.
- `@jrnyflw/piece-trace` adds `x-api-key` to the headers it always redacts. Then the key is hidden by name and does not depend on the scrub alone. This also covers any later piece that uses the same header.
- Portal errors come through as the trace helper reports them, for example `HTTP 500: {"error":"Failed to retrieve orders"}`.

### Files

```
packages/pieces/custom/aon-portal/
  package.json            @jrnyflw/aon-portal 0.1.0, same scripts and dependencies as shoprite
  tsconfig.json, tsconfig.lib.json, vitest.config.ts   copied from shoprite
  src/index.ts            createPiece "AON Customer Portal"
  src/lib/auth.ts         connection + validation
  src/lib/client.ts       aonPortalClient = { joinUrl, call, secretsOf }
  src/lib/actions/list-orders.ts
  src/lib/actions/acknowledge-order.ts
  src/lib/actions/custom-api-call.ts
  test/...
packages/pieces/custom/trace/src/lib/trace.ts   REDACTED_HEADERS gains 'x-api-key'
```

The directory name `aon-portal` is the name to add to `AP_DEV_PIECES` in each environment's `.env`. The UAT image already builds everything under `packages/pieces/custom/*`.

## Testing

Unit tests, with `httpClient.sendRequest` mocked as in the other pieces:

- List Orders follows `totalPages` across three pages and returns every order once, with `total`.
- List Orders with no orders returns `{ orders: [], total: 0 }`.
- List Orders stops with the 5,000-order message when `totalPages` is above 100.
- Acknowledge sends `PUT …/<id>/acknowledge` with the trimmed `erpOrderNumber`.
- Acknowledge rejects `10001` as an Order ID without calling the portal.
- The API key appears nowhere in a successful result, in a 401 failure, or in continue mode's error.
- Connection validation: 200 passes, 401 gives the API-key message.
- `piece-trace`: an `X-API-Key` header is recorded as `[redacted]` whatever its case.

Live check, read-only: run List Orders against the Shoprite portal and confirm it returns the current `processing` orders. **Acknowledge Order is not run against the live portal.**

## Open items

- **Acknowledge is untested.** We don't know its success response or its errors, for example for a wrong ID, an already acknowledged order or a cancelled order. We need a test order, or a staging portal, from the portal team before the flow goes live.
- **The full status list.** Order 10006 didn't appear under any status we tried.
- **Unknown status returns 500.** It would help if the portal returned 400 with the valid statuses. Not blocking, because the dropdown only offers known values.

## Decisions

- **Actions on a schedule, not a polling trigger.** An order stays in `processing` until it is acknowledged, so an order that failed in JRNY is picked up again on the next run. A polling trigger remembers the order IDs it has seen and would never retry a failed one.
- **One generic piece.** Each customer portal is a connection, because all AON portals share this API.
