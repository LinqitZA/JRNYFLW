
# Shoprite orders → JRNY: building the flow

Design: `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md`.

**Until the switch-over:**
- use the JRNY **dev** connection;
- never add Shoprite **Acknowledge Orders**;
- downloading is read-only, so every run sees the same orders, and step 4 skips the ones already loaded.

| # | Step | Settings |
| --- | --- | --- |
| trigger | Schedule, cron | `0 8,16 * * *`, Africa/Johannesburg |
| 1 | Shoprite · Download Orders | If the call fails: Stop |
| 2 | Router | `{{step_1.output.count}}` > 0 |
| 3 | Loop on Items | `{{step_1.output.orders}}` |
| 4 | JRNY · List Quotations | External Ref = `{{step_3.item.orderNumber}}` |
| 5 | Router | `{{step_4.output.data}}` list is empty, otherwise skip |
| 6 | JRNY · Resolve Order Lines | Customer `SHOE100`; Delivery Address `{{step_3.item.store.branch}}`; Fallback `0001`; Note Prefix `Shoprite PO {{step_3.item.orderNumber}}, {{step_3.item.store.name}} ({{step_3.item.store.branch}})`; Lines in list-mapper mode from `step_3.item.lines`: Stock Code ← `supplierItemCode`, Barcode ← `gtin`, Quantity ← `quantity`, Unit Price ← `unitPriceExclVat`, Description ← `description`, Reference ← `lineNumber`. If the call fails: Continue |
| 7 | Router | `{{step_6.ok}}` is true AND `{{step_6.output.lineCount}}` > 0 |
| 8 | JRNY · Create Quote | Customer `SHOE100`; Delivery Address by code `{{step_6.output.addressCode}}`; Lines in list-mapper mode from `step_6.output.lines` (stockCode, qty, unitPrice); External Reference `{{step_3.item.orderNumber}}`; Delivery Date `{{step_3.item.deliveryDate}}`; Notes `{{step_6.output.notes}}`; Auto-convert on; Auto-confirm `{{step_6.output.clean}}`; Idempotency Key `shoprite-{{step_3.item.orderNumber}}`. If the call fails: Continue |
| 9 | Router | `{{step_8.ok}}` is true AND `{{step_6.output.clean}}` is true |
| 10 | JRNY · Generate Pick | Sales Order Number from step 8's output (find the field with Test step, under `salesOrder`). If the call fails: Continue |

**Test it like this:**
1. Test step 1 against production. It's read-only.
2. Run steps 6–10 for two or three real orders against JRNY dev: one clean order, and one containing X STAMPER BOOK PK25 (no AON code).
3. In JRNY, check:
   - a confirmed sales order with a pick for the clean order;
   - a draft for the other, with the "Not loaded" note.
4. Run the flow again: step 5 should skip both.
