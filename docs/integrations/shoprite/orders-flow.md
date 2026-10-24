
# Shoprite orders → JRNY: building the flow

Design: `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md`.

**Importable version:** `docs/integrations/shoprite/shoprite-orders.flow.json`. It's built by `bunx tsx scripts/uat/gen-shoprite-orders-flow.ts docs/integrations/shoprite/shoprite-orders.flow.json`, which also checks every field against the pieces.

After importing:
1. **Pick both connections on every Shoprite and JRNY step.** The file has placeholders on purpose, so it can never land on production JRNY by accident.
2. **Check step 10's Sales Order Number.** It's set to `{{step_8['output']['salesOrder']['salesOrderNumber']}}`. Check the real field with Test step on step 8.

**Until the switch-over:**
- use the JRNY **dev** connection;
- never add Shoprite **Acknowledge Orders**;
- downloading is read-only, so every run sees the same orders, and steps 4 and 15 skip the ones already loaded.

| # | Step | Settings |
| --- | --- | --- |
| trigger | Schedule, cron | `0 8,16 * * *`, Africa/Johannesburg |
| 1 | Shoprite · Download Orders | If the call fails: Stop |
| 2 | Router | `{{step_1.output.count}}` > 0 |
| 3 | Loop on Items | `{{step_1.output.orders}}` |
| 4 | JRNY · List Quotations | Customer Code `SHOE100`; External Ref = `{{step_3.item.orderNumber}}` |
| 15 | JRNY · List Sales Orders (right after step 4) | Customer Code `SHOE100`; PO Reference = `{{step_3.item.orderNumber}}`. Finds orders the old platform created: it makes sales orders directly, with the Shoprite order number as the customer PO, no quote and no portal code. If the call fails: Continue |
| 5 | Router | `{{step_4.ok}}` and `{{step_15.ok}}` are true, and both `{{step_4.output.data}}` and `{{step_15.output.data}}` are empty; otherwise skip |
| 6 | JRNY · Resolve Order Lines | Customer `SHOE100`; Delivery Address `{{step_3.item.store.branch}}`; Fallback `0001`; Note Prefix `Shoprite PO {{step_3.item.orderNumber}}, {{step_3.item.store.name}} ({{step_3.item.store.branch}})`; Lines in list-mapper mode from `step_3.item.lines`: Stock Code ← `buyerItemCode` (Shoprite's item number: AON's JRNY products for Shoprite use it as the stock code), Barcode ← `gtin`, Quantity ← `quantity`, Unit Price ← `unitPriceExclVat`, Description ← `description`, Reference ← `lineNumber`; Warnings `{{step_3.item.warnings}}`. If the call fails: Continue |
| 7 | Router | `{{step_6.ok}}` is true AND `{{step_6.output.lineCount}}` > 0 |
| 8 | JRNY · Create Quote | Customer `SHOE100`; Delivery Address by code `{{step_6.output.addressCode}}`; Lines in list-mapper mode from `step_6.output.lines` (stockCode, qty, unitPrice, uom); External Reference `{{step_3.item.orderNumber}}`; Portal Code `SHOPRITE`; Delivery Date `{{step_3.item.deliveryDate}}`; Notes `{{step_6.output.notes}}`; Auto-convert on; Auto-confirm `{{step_6.output.clean}}`; Idempotency Key `shoprite-{{step_3.item.orderNumber}}`. If the call fails: Continue |
| 9 | Router | `{{step_8.ok}}` is true AND `{{step_6.output.clean}}` is true |
| 10 | JRNY · Generate Pick | Sales Order Number `{{step_8['output']['salesOrder']['salesOrderNumber']}}` (confirm the field with Test step on step 8). If the call fails: Continue |

On steps 4, 15, 6, 8 and 10, also turn on **Continue on Failure** in the step's error-handling options. The engine checks a step's fields before "If the call fails" runs, so without it one malformed order stops the rest of the batch.

**Test it like this:**
1. Test step 1 against production. It's read-only.
2. Run steps 6–10 for two or three real orders against JRNY dev: one clean order, and one containing X STAMPER BOOK PK25 (no AON code).
3. In JRNY, check:
   - a confirmed sales order with a pick for the clean order;
   - a draft for the other, with the "Not loaded" note.
4. Run the flow again: step 5 should skip both.

## Live flow (switch-over)

**File:** `docs/integrations/shoprite/shoprite-orders.live.flow.json`. Build it with:

```bash
bunx tsx scripts/uat/gen-shoprite-orders-flow.ts docs/integrations/shoprite/shoprite-orders.live.flow.json --acknowledge
```

It is the flow above plus acknowledging. An acknowledged order never downloads again, so:

1. **The old platform must have stopped** downloading and acknowledging Shoprite orders before this flow is switched on.
2. **Switch off or delete the dev flow,** so only one flow reads the Shoprite account.
3. **Pick the production JRNY connection** on steps 4, 15, 6, 8 and 10, and the Shoprite connection on steps 1, 12 and 14.

| # | Step | Settings |
| --- | --- | --- |
| 11 | Router "Already in JRNY?" (step 5's Otherwise) | step 4 found a quote, OR step 15 found a sales order (each: `ok` is true AND `output.data` is not empty) |
| 12 | Shoprite · Acknowledge Orders | Order Numbers `{{step_3.item.orderNumber}}`. If the call fails: Continue |
| 13 | Router "In JRNY?" (after step 9) | `{{step_8.ok}}` is true, OR `{{step_8.error.code}}` is exactly `DUPLICATE_PORTAL_ORDER` |
| 14 | Shoprite · Acknowledge Orders | As step 12 |

Steps 12 and 14 have Continue on Failure on.

**Acknowledged:** an order already in JRNY, an order created now (confirmed or draft), and an order JRNY refuses as a duplicate.

**Never acknowledged, so it downloads again next run:**
- an order with no loadable lines;
- an order whose quote failed for any other reason (for example, the store wasn't found and the fallback address failed, or JRNY was down);
- an order whose "Already loaded?" check failed.

To clear an order with no loadable lines, create it in JRNY by hand with **External Reference = the Shoprite order number** and **Portal Code `SHOPRITE`**. The next run finds it, acknowledges it and stops downloading it.
