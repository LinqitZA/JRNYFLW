# Shoprite B2B orders → JRNY: design

**Date:** 2026-10-17
**Status:** Draft for review
**Pieces:** `@jrnyflw/shoprite` (Download Orders), `@jrnyflw/jrny` (new Resolve Order Lines and Generate Pick, Create Quote additions)
**Follows:** the invoice flow back to Shoprite gets its own spec once orders are flowing.

## Purpose

Shoprite stores order AON stationery through Shoprite's B2B Supplier Services, as GS1 eCom 3.2 orders. An existing system downloads these today. JRNYFLW replaces it on a switch-over date.

This flow loads each Shoprite order into JRNY:
- as a confirmed sales order with its pick generated when everything matches;
- as a draft sales order, with the problem written on it, when a store or an item doesn't match.

**Success:**
- every order Shoprite releases reaches JRNY within one run;
- nothing is loaded twice;
- nothing is silently lost: a line that can't be loaded is named on the order and in the run output.

## What we know about the Shoprite API

From a production download on 2026-10-17 (22 orders, batch created 2026-10-16 16:00):

- **`GET {baseUrl}/api/VendorOrder` is read-only.** Calling it again returns the same orders. Orders stay "new" until acknowledged. Before the switch-over, the flow can download as often as it likes without affecting the existing system.
- **The response is one GS1 document**:
  - `standardBusinessDocumentHeaderField`: the document header. `instanceIdentifierField` lists every order number, comma-separated.
  - `orderField[]`: one entry per order.
- **Header totals are `null`**, so totals come from the lines.
- **Prices:**
  - `monetaryAmountExcludingTaxesField` / `…IncludingTaxesField` are **unit** prices;
  - `netAmountField` is the line total excl. VAT;
  - `netPriceField` is the line total **incl.** VAT, despite its name. VAT is 15%.
- **Item codes:** `SUPPLIER_ASSIGNED_ITEMID` (AON's code) is sometimes an empty string. In the sample, "X STAMPER BOOK PK25" (GTIN `06001224126747`) has none.
- **GTINs are 14 digits with leading zeros** (`06001001438896`, `02200072626667`), and must be used exactly as given.
- **Store codes** are numeric (`1608`, `270`) or `G`-prefixed (`G622`).
- **The discount attributes** (`ORDER_DISCOUNT`, ten types) were all `0.00`.

## Piece work

### 1. Shoprite · Download Orders returns plain orders

Same call as today. The output changes to:

```json
{
  "count": 22,
  "createdAt": "2026-10-16T16:00:19.7071905+02:00",
  "orderNumbers": "1221181491,1221184951,…",
  "orders": [{
    "orderNumber": "1221181491",
    "headerId": "242306305",
    "orderType": "220",
    "orderDate": "2026-10-16",
    "deliveryDate": "2026-10-19",
    "store": { "branch": "1608", "name": "CHECKERS SCOTTSVILLE", "gln": "6001001016001" },
    "lines": [{
      "lineNumber": 1,
      "supplierItemCode": "CSL1388",
      "gtin": "06001001438896",
      "buyerItemCode": "10367034",
      "description": "KEY CONTROL 5PACK BOOK",
      "quantity": 1,
      "uom": "EA",
      "unitPriceExclVat": 38.16,
      "unitPriceInclVat": 43.88,
      "lineTotalExclVat": 38.16,
      "lineTotalInclVat": 43.88,
      "deliveryDate": "2026-10-19",
      "shipTo": { "branch": "1608", "gln": "6001001016001" }
    }],
    "totalExclVat": 38.16,
    "totalInclVat": 43.88,
    "warnings": []
  }]
}
```

**Where each field comes from:**

| Field | GS1 source |
| --- | --- |
| `orderNumber` | `orderIdentificationField.entityIdentificationField` |
| `headerId` | `orderIdentificationField.contentOwnerField.additionalPartyIdentificationField[]`, type `BUYER_ASSIGNED_ORDER_HEADERID` |
| `orderType` | `orderTypeCodeField.valueField` |
| `orderDate` | date part of `creationDateTimeField` |
| `store.gln` | `buyerField.glnField` |
| `store.branch`, `store.name` | `buyerField.additionalPartyIdentificationField[]`, types `BUYER_ASSIGNED_IDENTIFIER_FOR_A_PARTY` and `BUYER_ASSIGNED_DESCRIPTION_FOR_A_PARTY` |
| `lineNumber` | `lineItemNumberField`, as a number |
| `supplierItemCode`, `buyerItemCode` | `transactionalTradeItemField.additionalTradeItemIdentificationField[]`, types `SUPPLIER_ASSIGNED_ITEMID` and `BUYER_ASSIGNED_ITEMID`. Trimmed; an empty string becomes `null`. |
| `gtin` | `transactionalTradeItemField.gtinField`, exactly as sent |
| `description` | `transactionalTradeItemField.tradeItemDescriptionField.valueField` |
| `quantity` | `requestedQuantityField.valueField` |
| `uom` | `avpListField[]`, attribute `BUYER_ASSIGNED_UNITOFMEASURE` |
| unit prices, line totals | as described in "What we know" above |
| line `deliveryDate`, `shipTo` | `orderLineItemDetailField[0].orderLogisticalInformationField`: date part of `orderLogisticalDateInformationField.requestedDeliveryDateTimeField.dateField`, and `shipToField` (GLN, plus branch number from `BUYER_ASSIGNED_BRANCH_NUMBER`) |

**Derived fields:**
- the order `deliveryDate` is the earliest line delivery date;
- the totals are the line totals added up, rounded to 2 decimals.

**`warnings` (text, per order):**
- a line ships to a different GLN than the buyer;
- a non-zero `ORDER_DISCOUNT` on any line;
- an order type other than `220`.

**Behaviour:**
- **An empty batch** returns `count: 0` and `orders: []`. Since we haven't seen one yet, treat a blank body, `null`, a missing `orderField` and an empty array all as empty.
- **Fails with "Unexpected response from Shoprite: …"** when:
  - the body isn't an object;
  - `orderField` isn't an array;
  - an order has no order number;
  - an order has no lines.
- **The raw GS1 document isn't returned.** At 22 orders it's very large. The call still appears in `sent`, with the credentials redacted.

### 2. JRNY · Resolve Order Lines (new, not specific to Shoprite)

It checks an order's delivery address and items against JRNY before the quote is created, so that a bad store or item doesn't fail the whole order.

**Inputs:**

| Input | Type | Notes |
| --- | --- | --- |
| Customer Code | text, required | e.g. `SHOE100` |
| Delivery Address Code | text | e.g. the store branch `1608` |
| Fallback Address Code | text | default `0001` |
| Note Prefix | text | e.g. `Shoprite PO 1221181491, CHECKERS SCOTTSVILLE (1608)` |
| Lines | list: Stock Code, Barcode, Quantity, Unit Price, Description, Reference | mapped from the order's lines in list-mapper mode |
| If the call fails | the standard setting | |

**Address:**
- reads the customer's delivery addresses once, with `GET …/customers/{code}/addresses`;
- if the given code is in the list, it's used;
- otherwise (including when it's blank) the fallback code is used and `addressFallback` is `true`;
- an unknown customer fails the step, because that's a setup mistake, not data.

**Items, for each line:**
1. **Stock Code** not blank: `GET …/products/{stockCode}`. If found, it matches by `stockCode`.
2. Otherwise, or on a 404, **Barcode** not blank: `GET …/products/by-barcode/{barcode}`, the new JRNY endpoint. The barcode is sent **exactly as given**, URL-encoded, with leading zeros kept. If found, it matches by `barcode`, and the line takes the product's stock code. JRNY treats a 13-digit EAN as matching the same 14-digit GTIN, so we never change the barcode ourselves.
3. Otherwise the line is **dropped** with the reason `item not found`.

**Also:**
- a product with `isActive: false` is dropped (`inactive in JRNY`);
- a quantity of 0 or less is dropped (`quantity must be more than 0`);
- repeated codes or barcodes within one call are looked up once;
- any response other than 200 or 404 (401, 5xx, an unreachable host) fails the step, because the result would be wrong, not just incomplete;
- **until JRNY ships the by-barcode endpoint**, its route returns 404, so those lines are dropped with `item not found`. That's correct behaviour: the order still loads as a draft, with the line named.

**Output:**

```json
{
  "addressCode": "1608",
  "addressFallback": false,
  "lines": [{ "stockCode": "CSL1388", "qty": 1, "unitPrice": 38.16, "reference": "1", "matchedBy": "stockCode" }],
  "lineCount": 8,
  "dropped": [{ "reference": "3", "description": "X STAMPER BOOK PK25", "stockCode": null, "barcode": "06001224126747", "reason": "item not found" }],
  "clean": false,
  "notes": "Shoprite PO 1221181491, CHECKERS SCOTTSVILLE (1608).\nNot loaded: line 3 X STAMPER BOOK PK25 (barcode 06001224126747): item not found."
}
```

- `clean` is true only when there's no address fallback and nothing was dropped.
- `notes` is the prefix plus one sentence per problem:
  - `Delivery address 1608 not found; used 0001.`
  - `Not loaded: line … (…): <reason>.`
- `lines` is in the shape Create Quote's Lines list expects.

### 3. JRNY · Create Quote additions

| New input | Sent as | Check before the call |
| --- | --- | --- |
| Delivery Date | `deliveryDate` | `YYYY-MM-DD` |
| Auto-confirm Sales Order | `autoConfirm: true` | needs Auto-convert and a Delivery Date, or the step fails with a message saying so |
| Idempotency Key | the `Idempotency-Key` header | — |

- Auto-confirm can be set from a field, e.g. `{{step_N.output.clean}}`.
- `jrnyClient.callJrny` gains optional extra headers for the Idempotency Key.

### 4. JRNY · Generate Pick (new)

This calls JRNY's new `POST …/sales-orders/{orderNumber}/generate-pick`. The endpoint:
- uses JRNY's own pick-generation rules and refusals;
- records the pick as made by the API key's user;
- returns the pick number and lines.

**Inputs:**
- Sales Order Number;
- If the call fails: the standard setting.

**Output:** JRNY's response as returned (pick number and lines).

**Errors:**
- **409:** a sales order that isn't confirmed (e.g. it went to Credit Hold), or one a pick already covers. JRNY sends this instead of creating a second pick. It surfaces as a normal JRNY error, with `error.code` for a Router.
- Anything else follows the JRNY piece's error handling.

## The flow

```
Schedule: 08:00 and 16:00, Africa/Johannesburg
1. Shoprite · Download Orders
2. Router: {{step_1.output.count}} > 0
   3. Loop on {{step_1.output.orders}}
      4. JRNY · List Quotations     externalRef = {{loop.item.orderNumber}}
      5. Router: {{step_4.output.data}} is empty   (otherwise: already loaded, skip)
         6. JRNY · Resolve Order Lines
              Customer SHOE100 · Address {{loop.item.store.branch}} · Fallback 0001
              Note Prefix "Shoprite PO {{orderNumber}}, {{store.name}} ({{store.branch}})"
              Lines ← loop.item.lines: Stock Code = supplierItemCode, Barcode = gtin,
                      Quantity = quantity, Unit Price = unitPriceExclVat,
                      Description = description, Reference = lineNumber
         7. Router: {{step_6.output.lineCount}} > 0   (otherwise: nothing loadable, reported)
            8. JRNY · Create Quote
                 SHOE100 · address {{step_6.output.addressCode}} · lines {{step_6.output.lines}}
                 External Reference = orderNumber · Delivery Date = loop.item.deliveryDate
                 Notes = {{step_6.output.notes}} · Auto-convert on · Auto-confirm = {{step_6.output.clean}}
                 Idempotency Key = shoprite-{{orderNumber}} · If the call fails → Continue
            9. Router: {{step_8.ok}} is true AND {{step_6.output.clean}} is true
               10. JRNY · Generate Pick   Sales Order = {{step_8.output.salesOrder.orderNumber}}
                                          If the call fails → Continue
```

The exact path to the sales order number in Create Quote's output is checked with a Test step when the flow is built.

| Case | Result in JRNY |
| --- | --- |
| Store and every item match | Confirmed sales order, pick generated |
| Clean, but confirmation stops (e.g. Credit Hold) | Sales order on hold; Generate Pick gets a 409 and staff take over in JRNY |
| Store not found | Draft sales order at address `0001`, with a note |
| Some items not found | Draft sales order without those lines, with a note per line |
| No items found | No quote; listed in the run output (email later) |
| Already loaded (same PO) | Skipped |
| Create Quote fails | No quote; the next run retries it |

**Rules:**
- **Shoprite's unit price excl. VAT goes on each line,** so the invoice matches the PO (agreed 2026-10-17).
- **No step inside the loop stops the run.** Failures use Continue. The failure emails come once MS Graph Mail is connected (`ms-graph-mail` piece).
- **The duplicate check, plus the idempotency key,** make reruns safe. Before the switch-over, every run sees the same orders.

### Before and after the switch-over

- **Until the switch-over:**
  - the flow points at **JRNY dev**;
  - it never calls Acknowledge Orders;
  - the existing system keeps acknowledging in production.
- **At the switch-over:**
  - the old system stops;
  - the flow moves to the production JRNY connection;
  - an acknowledge step is added after the loop.

  The acknowledge step's design waits on Shoprite's answers (below). The aim is to acknowledge only when every order in the batch was created, already existed, or was reported as having nothing loadable.

## Out of scope

- Invoices to Shoprite (next spec).
- Email notifications (added to the failure branches once MS Graph Mail is connected).
- Acknowledge Orders changes (at the switch-over).
- ASNs, claims and rebates.

## Answered (2026-10-17)

- A 13-digit EAN in JRNY matches the 14-digit GTIN on the by-barcode endpoint.
- `externalReference` becomes the invoice's `customerPoNumber`, so the invoice flow can find the Shoprite PO.
- Past delivery dates are accepted, and JRNY notes them.
- Picks: JRNY is adding `POST …/sales-orders/{orderNumber}/generate-pick` (Generate Pick, above). Confirming alone doesn't create the pick.
- Acknowledge works per order: `PUT …/api/VendorOrder?action=Acknowledge` with an XML `<ArrayOfLong>` of order numbers. The Acknowledge Orders action now sends exactly that. It's still never used before the switch-over.

## Open questions

**JRNY team:**
1. **The by-barcode endpoint:** its response shape (assumed to be the same as Get Product) and its not-found status (assumed to be 404).
2. **generate-pick:** the `error.code` values on its 409s. We'd like to tell "not confirmed" apart from "already picked".
3. Does List Quotations `externalRef` match exactly?

**Shoprite:**
4. What an empty download looks like.

## Testing

- **Download Orders:** unit tests on a trimmed fixture built from the 2026-10-17 download (three orders: multi-line, a blank supplier code, a different delivery date). The structure and codes are kept, but store names and prices are changed, so no production pricing is committed. Cover:
  - the field mapping;
  - unit prices versus line totals;
  - an empty supplier code becoming `null`;
  - the GTIN kept exactly;
  - the earliest delivery date;
  - the totals;
  - each warning;
  - the empty-batch forms;
  - each "Unexpected response" case.
- **Resolve Order Lines:** unit tests with HTTP mocked. Cover:
  - a stock-code hit;
  - a 404 then a barcode hit (assert the URL carries `06001224126747` unchanged);
  - both missing;
  - inactive;
  - quantity 0;
  - address found, missing or blank;
  - an unknown customer;
  - a 500 failing the step;
  - repeated codes looked up once;
  - the notes text.
- **Create Quote:** tests for the new fields, the autoConfirm checks and the Idempotency-Key header.
- **Generate Pick:** tests for the path and method, the order number URL-encoded, and a 409 surfacing `error.code`.
- **Live:**
  - Download Orders as a Test step against production (read-only, confirmed);
  - Resolve and Create Quote against JRNY dev, for two or three real orders from the download.
