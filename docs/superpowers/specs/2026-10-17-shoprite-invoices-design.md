# Shoprite invoices (JRNY → Shoprite): design

**Date:** 2026-10-17
**Status:** Draft for review
**Branch:** `shoprite-invoices`
**Depends on:**
- the Shoprite orders work (merged 9b7633f7e1): the `@jrnyflw/shoprite` client and the orders flow;
- JRNY (handover 2026-10-18, see "JRNY's invoice endpoints"): the pull, api-delivery and invoice GLN are live; GTIN and product code on lines are on JRNY dev and reach production with the next AON deploy. Still needed: GLNs and Shoprite GTINs loaded as data.

## Purpose

Shoprite expects an electronic GS1 invoice for every order AON delivers. Today another system sends these, and JRNYFLW replaces it at the switch-over.

This flow runs on its own schedule:
1. It asks JRNY for invoices ready to send to Shoprite.
2. It posts each one to Shoprite's `VendorInvoice` API as GS1 invoice XML.
3. It records in JRNY whether Shoprite took it, so a sent invoice is never fetched again and a failed one shows why.

**Success:**
- every Shoprite invoice reaches Shoprite without anyone re-keying it;
- a sent invoice is never sent twice;
- a failed invoice shows its reason in JRNY and goes again on the next run.

## What we know about Shoprite's API

**Request:**
- `POST {baseUrl}/api/VendorInvoice`, with `Content-Type: application/xml`.
- It uses the same auth headers as the orders calls.
- The body is one `invoiceMessage` per invoice. The layout is fixed by the sample the user supplied on 2026-10-17 (see "The XML").

**Success:**
- HTTP 200 or 201, with the body `<string>1 record was successfully inserted</string>`.

**Failure:**
- Any other status, with an XML `<Error>` containing `Message`, `ExceptionMessage`, `ExceptionType` and `StackTrace`.
- Validation errors are generic. "The Invoice Message is empty or not recognized" lists the usual causes but never names the bad field:
  - mismatched namespaces;
  - redundant spaces;
  - a wrong Content-Type;
  - empty tags;
  - missing required elements such as the buyer GLN.

That is why Send Invoice checks the invoice itself before sending (see "Checks before sending").

## Piece work: Shoprite "Send Invoice"

This replaces **Upload Invoice**. Upload Invoice posts the message as JSON, has never worked, and isn't used in any flow, so it is removed.

### Connection

Two new **optional** fields go on the Shoprite connection. They are optional so the existing connection keeps validating and the orders flow is unaffected.

| Field | Example | Used for |
| --- | --- | --- |
| Supplier GLN | `6001651203943` | SBDH Sender, `contentOwner`, `seller` |
| VAT Registration Number | `4030209045` | `seller/legalRegistrationNumber` |

- Send Invoice refuses to run when either field is blank: "Add the Supplier GLN to the Shoprite connection".
- Connections can't be edited yet, so adding the fields means creating a new Shoprite connection and picking it in both flows.
- The existing **Invoice Endpoint** field (VendorInvoice / B2BInvoice) stays and picks the path.

### Inputs

| Input | Type | Notes |
| --- | --- | --- |
| Invoice Number | text, required | JRNY invoice number, e.g. `2283330` |
| Invoice Date | text, required | `YYYY-MM-DD` |
| Purchase Order | text, required | Shoprite's order number (JRNY `customerPoNumber`) |
| Store GLN | text, required | The Shoprite store being invoiced. It is both `buyer` and `shipTo`, and it is the SBDH Receiver. |
| Total Excl. VAT | number, required | |
| Total VAT | number, required | |
| Total Incl. VAT | number, required | |
| Lines | array, required | Each line: Line Number, Quantity, Line Total Excl. VAT, Line Total Incl. VAT, Description, GTIN |
| If the call fails | the standard setting | Stop by default. The flow uses Continue. |

**Line VAT** is not an input. It is calculated as incl. minus excl., which keeps each line consistent with itself. In the sample, 433.26 − 376.75 = 56.51.

### Checks before sending

An invoice that fails any check is never sent. The error names the field:

| Check | Example message |
| --- | --- |
| Required text fields not blank | "Purchase Order is required" |
| Invoice Date is a real `YYYY-MM-DD` date | "Invoice Date must be YYYY-MM-DD, e.g. 2026-10-17" |
| Store GLN is 13 digits with a valid GS1 check digit | "Store GLN 6001001462708 has a wrong check digit" |
| At least one line | "The invoice has no lines" |
| Line numbers unique and positive | "Line 2 appears twice" |
| Quantity above 0 | "Line 3: quantity must be more than 0" |
| Amounts are numbers, with excl. ≥ 0 and incl. ≥ excl. | "Line 3: Line Total Incl. VAT is less than excl." |
| Line VAT is 15% of excl., to within 1 cent | "Line 3: VAT 12.00 is not 15% of 376.75" |
| GTIN is 14 digits with a valid check digit | "Line 3: GTIN 02200072627771 has a wrong check digit" |
| Header totals equal the line sums, to within 1 cent | "Total Incl. VAT 433.27 does not match the lines (433.26)" |
| Supplier GLN and VAT number are on the connection | "Add the Supplier GLN to the Shoprite connection" |

More rules:
- **GTIN:** a 13-digit EAN gets a leading zero to make 14 digits. Leading zeros are never stripped.
- **Text:** surrounding spaces are trimmed. A description that is blank after trimming is refused, because Shoprite rejects empty tags.
- **Zero-rated or exempt lines** are out of scope. Every line must be STANDARD 15%. A zero-VAT line fails the 15% check until Shoprite confirms the code it expects for zero-rated lines.

### The XML

The builder reproduces the sample exactly.

**Layout:**
- `<?xml version="1.0" encoding="utf-8"?>`, then `<invoiceMessage …>` with no line break between them.
- `<StandardBusinessDocumentHeader …>` follows immediately, also with no break.
- Line breaks are real CR LF. Indentation is two spaces per level, as in the sample, including the sample's quirk: the SBDH children are indented one level, and so is `<invoice xmlns="">` after `</StandardBusinessDocumentHeader>`.
- **Namespaces are copied verbatim:**
  - root: `xmlns:xsd`, `xmlns:xsi`, `xmlns="urn:gs1:ecom:invoice:xsd:3"`;
  - SBDH: `xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader"`;
  - both `invoice` elements: `xmlns=""`.
- `<Manifest />` is written self-closed, as in the sample.
- **Text escaping:** `&`, `<` and `>` in text, plus `"` in attributes. Control characters other than tab are removed.

**Values:**

| Element | Value |
| --- | --- |
| SBDH `Sender/Identifier[@Authority=SenderEAN]` | Supplier GLN |
| SBDH `Receiver/Identifier[@Authority=ReceiverEAN]` | Store GLN |
| SBDH `Standard`, `TypeVersion`, `Type`, `MultipleType`, `HeaderVersion` | `Standard`, `3.2.0`, `Invoice`, `false`, `3.2.0` |
| SBDH `InstanceIdentifier` | Invoice Number |
| SBDH `CreationDateAndTime` | time of sending, South African time, e.g. `2026-10-17T10:15:00+02:00` |
| `creationDateTime` | the sending date at midnight, `2026-10-17T00:00:00+02:00` |
| `documentStatusCode` / `documentActionCode` | `ORIGINAL` / `ADD` |
| `documentStructureVersion` / `revisionNumber` | `3.2.0` / `1.0` |
| `documentEffectiveDate/date` | Invoice Date |
| avp `InstanceIdentifier` | Invoice Number |
| avp `InvoiceRefNo` | a UUID derived from the Supplier GLN and Invoice Number (name-based, SHA-1), so a resend carries the same reference |
| `InvoiceIdentification/entityIdentification`, nested `invoice/entityIdentification` | Invoice Number |
| `contentOwner/gln` (both), `seller/gln` | Supplier GLN |
| `invoiceType`, `invoiceCurrencyCode`, `countryOfSupplyOfGoods` | `INVOICE`, `ZAR`, `ZA` |
| `buyer/gln`, `shipTo/gln` | Store GLN |
| `legalRegistrationNumber` | VAT Registration Number |
| `totalInvoiceAmount` / `totalInvoiceAmountPayable` / `totalVATAmount` | Total Excl. / Total Incl. / Total VAT, 2 decimals, `currencyCode="ZAR"` |
| `purchaseOrder/entityIdentification` | Purchase Order |
| `lineItemNumber` | Line Number |
| `invoicedQuantity` | Quantity, 6 decimals |
| `amountExclusiveAllowancesCharges` / `amountInclusiveAllowancesCharges` | line totals, 2 decimals, `currencyCode="ZAR"` |
| `note[@languageCode=EN]` | Description |
| `gtin` | GTIN (14 digits) |
| `transactionalItemWeight/measurementValue[@measurementUnitCode=EA]`, `size/sizeCode` | `0`, `1` (fixed, as in the sample) |
| `dutyFeeTaxAmount` / `CategoryCode` / `Percentage` / `TypeCode` | line VAT, `STANDARD`, `15.00`, `VAT` |

Lines are written in Line Number order.

### Response handling

| Shoprite answers | Result |
| --- | --- |
| 200/201 and the body contains `successfully inserted` | **Success.** Output: `{ invoiceNumber, invoiceRefNo, purchaseOrder, storeGln, lineCount, totalInclVat, shopriteMessage }`. `shopriteMessage` is the text inside `<string>`. |
| 200/201 with any other body | **Failure:** "Shoprite answered <status> but did not confirm the invoice: <body>. Check in Shoprite before resending." It may have been taken, so a person checks before the next run resends it. |
| Any other status with an `<Error>` body | **Failure.** The message is `<Message>`'s text with XML escapes decoded, literal `\r\n` sequences and real line breaks collapsed to single spaces, and a leading "Validation Error:" kept. The stack trace and exception type are left out. The text is capped at 1,000 characters. |
| Any other status, no recognisable body | **Failure:** `HTTP <status>: <body>`, the standard trace message, capped at 1,000 characters. |

**Error codes (added in the review, 2026-10-18).** Every failure carries `error.code`:
- `INVALID`: failed the checks, or the connection lacks the supplier details;
- `REJECTED`: Shoprite answered with an error;
- `UNCONFIRMED`: a 2xx without "1 record … successfully inserted", or no answer at all (connection failed or timed out, or an empty 5xx). The invoice may have landed.

Phase 2's flow must not resend `UNCONFIRMED` automatically. It should record it in JRNY so that a person checks Shoprite first.

Only a count of one confirms: "0 records were successfully inserted" is `UNCONFIRMED`. A failed-checks message is capped at 1,000 characters ("…; and N more").

**Failure output** follows the usual trace contract, `{ ok: false, error: { message, status, … } }`, so the flow can pass `error.message` to JRNY. The full response is always in the step's `sent` trace. The Authorization, Authentication and password values are redacted there, as for the orders calls.

## Piece work: JRNY

Two hand-written actions on JRNY's endpoints (see "JRNY's invoice endpoints"):
- **List Invoices Ready to Send:** takes a customer code and a From Date. List rows carry no lines, so it lists, then fetches each invoice's detail, and returns `{ count, invoices[], waiting }` with the fields Send Invoice needs. It lists `apiDelivery=unsent` and `apiDelivery=failed`.
  - **Left out without a word** (they are not ready, and nothing is wrong):
    - failed invoices whose message starts `UNCONFIRMED` (they may have reached Shoprite; a person checks and resets them in JRNY);
    - invoices with no customer PO number;
    - **invoices not yet delivered:** the invoice's sales order's dispatch notes (`GET …/dispatch-notes?salesOrderNumber=`) must all have a POD (`podSignedAt` or `podUrl`). An invoice with no sales order or no dispatch is left out too. `waiting` counts these per reason so the run shows why nothing went.
  - **Listed with a `problem`, so the flow records them as failed with a reason staff can fix** (`problem` is null on a clean invoice):
    - a line whose `gtinSource` is not `gtin`: "Line 2 (TRI200, BOX): no Shoprite GTIN in JRNY". A `default` barcode is never sent to Shoprite.
    - a delivery address with no GLN: "Delivery address 1608 has no GLN in JRNY".
    All problems of an invoice are joined with "; ".
  - Each line's incl. VAT total is `lineTotal + vatAmount`.
  - Pages are fetched in full, with the same cap-and-error pattern as List Courier Dispatches. JRNY rate-limits (429), so calls are made one at a time and a 429 is retried after its `Retry-After`.
- **Record Invoice Result:** takes a document number, a status (`sent` / `failed`), the external reference or the message, and posts `api-delivery` with `occurredAt` as UTC ISO time and an `Idempotency-Key`.

**Unblocked.** Everything the actions need is on JRNY dev. Production gets the line GTINs with the next AON deploy, and until GLNs and GTINs are loaded every invoice is recorded as failed with what is missing.

## The flow

```
Schedule: hourly, 07:00–19:00 Africa/Johannesburg (0 7-19 * * *)
1. JRNY · List Invoices Ready to Send       customer SHOE100          (Stop on failure)
2. Router "Anything to send?"  count > 0
   3. Loop on {{step_1.output.invoices}}
      4. Router "Clean?"  item.problem is empty
         ├─ Clean
         │    5. Shoprite · Send Invoice              fields from the loop item, Lines by list mapper
         │                                            If the call fails → Continue; Continue on Failure on
         │    6. Router (first match)
         │       ├─ Sent     step_5 ok is true
         │       │    7. JRNY · Record Invoice Result  sent, externalReference = invoiceRefNo
         │       └─ Otherwise
         │            8. JRNY · Record Invoice Result  failed, message = "<error.code>: <error.message>"
         └─ Otherwise
              9. JRNY · Record Invoice Result  failed, message = "INVALID: <item.problem>"
```

**How it behaves:**
- **A sent invoice drops out of the next run,** because JRNY no longer lists it.
- **A failed invoice goes again next run,** unless it failed UNCONFIRMED. That covers Shoprite being down. A permanently bad invoice keeps failing, and JRNY shows the same reason, until someone corrects it.
- **An UNCONFIRMED invoice is never resent automatically.** It may already be in Shoprite. Someone checks, then resets it in JRNY, and a reset invoice comes back as unsent.
- **One bad invoice never stops the others.** Every step inside the loop has Continue on Failure on. The Record Invoice Result steps (7, 8, 9) also continue, because a JRNY write failure must not stop the loop.
- **If Record Invoice Result fails after a successful send,** the invoice is sent again next run. Whether Shoprite rejects a duplicate invoice number is an open question. Until it is answered, this is the one double-send path. It needs JRNY to fail right after Shoprite accepted, which should be rare.
- **No emails yet.** IT notification steps get added once the MS Graph connection exists.
- **Generator:** an importable flow JSON at `docs/integrations/shoprite/shoprite-invoices.flow.json`, built by `scripts/uat/gen-shoprite-invoices-flow.ts` with the same self-checks as the orders generator. It has placeholder connections and needs the JRNY action names, so it is built after the JRNY actions.

## GTINs: one per product

Shoprite orders each product against a single GTIN. So the GTIN is a property of the product in JRNY, not something carried through from each order:
- **Order intake** (already built): Resolve Order Lines looks a line up by product code first, then by GTIN through JRNY's barcode lookup.
- **Invoices:** each invoice detail line carries `gtin` and `gtinSource`. Only `gtinSource: "gtin"` counts: a GTIN-type barcode set up for the line's own unit, so a box line only gets the box GTIN. `"default"` is a fallback barcode and is never sent.

The orders flow needs no change.

**On JRNY dev, 18 Oct, after the first GTIN import** (unsent SHOE100 invoices since 1 Sep with a PO: 189 invoices, 588 lines): 236 lines have a confirmed GTIN, 352 only a default barcode (most of them 8-digit internal codes that fail the GTIN check digit). 36 invoices have a confirmed GTIN on every line.

## JRNY's invoice endpoints (confirmed by the JRNY team, 2026-10-18)

- **Pull:** `GET …/invoices?customerCode=SHOE100&apiDelivery=unsent`, oldest first. The same shape exists for `credit-notes` and `debit-notes`. `fromDate` sets where each customer starts.
- **Report back:** `POST …/invoices/:number/api-delivery` with `{ status: 'sent' | 'failed', externalReference, message, occurredAt }`.
  - `occurredAt` must carry `Z` or `±hh:mm`.
  - `message` is required for `failed`, up to 2,000 characters; `externalReference` up to 255.
  - A second `sent` with a different reference returns 409 `ALREADY_SENT`. The same reference again returns 200 with `changed: false`, and InvoiceRefNo is stable, so a repeated `sent` is harmless.
- **A reset document comes back as unsent.** Its `apiDelivery` field is not null, so the flow trusts the `apiDelivery=unsent` filter and never skips a document because the field has a value.
- **Invoice list and detail** carry `deliveryAddress { code, gln }`: the document's own delivery address, else its sales order's. `gln` is null until AON captures it. Amounts are numbers.
- **Detail lines** carry `lineNumber`, `productCode`, `description`, `quantity`, `uom`, `unitPrice`, `vatRate`, `lineTotal` (excl.), `vatAmount`, `taxCode`, `gtin`, `gtinSource`. Every key is always present (null when empty). The detail call works the GTIN out each time, so it beats the `invoice.created` webhook.
- **Dispatch automation (built, switched off):** JRNY can post a dispatch and raise its invoice at courier booking. Such invoices are ordinary unsent invoices, so the POD check above is what keeps them back until delivery. JRNY's `shipping.delivered` webhook fires when the invoice is raised, so it is never treated as delivery.
- **Identity (next deploy):** documents created through the key show as JRNYFLW. Retrying a request first sent before that deploy with the same `Idempotency-Key` runs it again; the orders flow is safe because it sends `portalCode` + `externalReference`.

**On JRNY dev, 18 Oct:** every one of the 189 PO invoices since 1 Sep has exactly one dispatch through its sales order: 43 delivered with a POD, 136 manifested, 10 booked. No delivery address has a GLN yet. 657 further unsent invoices since 1 Sep have no PO (one free-text line, no sales order) and are left out.

## What we still need from JRNY and AON

1. **The next AON deploy,** which brings `productCode`, `gtin` and `gtinSource` to production.
2. **Shoprite GTINs loaded** as GTIN-type barcodes at the unit Shoprite orders in, for every product Shoprite buys.
3. **GLNs on the Shoprite delivery addresses,** one per store.

## Error handling

| Failure | What happens |
| --- | --- |
| The JRNY ready list fails | The run fails (Stop) and is retried on the next schedule. |
| An invoice fails the checks | Not sent. Recorded in JRNY as failed with the check's message. |
| Shoprite rejects an invoice | Recorded in JRNY as failed with Shoprite's message. Retried next run. |
| Shoprite is down or times out | Same as a rejection. |
| 2xx without the confirmation text | Recorded as failed with "Check in Shoprite before resending". |
| Recording the result in JRNY fails | That step fails, the loop carries on, and the run history shows it. A sent invoice whose `sent` didn't record goes again next run. |

## Safety

- **Never send a test invoice to Shoprite production.** The first live invoice happens only with the user's explicit go-ahead, at or after the switch-over. Until then, the flow runs against JRNY dev with Send Invoice disabled or skipped.
- **Committed fixtures use made-up GLNs, GTINs, prices and descriptions.** They must still have valid check digits.

## Testing

**Send Invoice:** unit tests, with the HTTP client mocked.
- **Golden XML:** a made-up invoice produces exactly the expected string. That string is the user's sample with its values swapped, so it checks the CR LF line breaks, the indentation, the namespaces and the self-closed `Manifest`. The clock is fixed.
- **Each check** in "Checks before sending" has a test, and no HTTP call is made.
- **Values:** EAN-13 to GTIN-14 padding; escaping in descriptions; line ordering; 2-decimal amounts; 6-decimal quantity; line VAT calculated as incl. minus excl.
- **`InvoiceRefNo`:** the same for the same invoice, different for a different invoice.
- **Responses:**
  - 200 with "successfully inserted" gives success;
  - 201 gives success;
  - 200 with another body gives the check-in-Shoprite failure;
  - 400 with the user's `<Error>` sample gives the cleaned message, with no stack trace;
  - 500 with a plain body gives the trace message.
- **The request:** method, path (VendorInvoice / B2BInvoice), Content-Type and redaction.
- **Connection:** missing Supplier GLN or VAT number.

**JRNY actions:** unit tests once their shapes are known.

**Flow:**
- the generator's self-checks;
- an import test in the UAT builder against JRNY dev, with Send Invoice's **Test step** run against a mocked or test endpoint only;
- a live Shoprite test needs a Shoprite test environment, or the user's go-ahead for one real invoice.

## Out of scope

- Credit notes.
- Zero-rated or exempt lines.
- Allowances and charges (trade discounts) on invoice lines.
- Emails to IT.
- The B2BInvoice-specific `internalUser` parameter.

## Open questions

1. **`InvoiceRefNo`:** does the old system reuse it on a resend? This design keeps it stable.
2. **Duplicates:** does Shoprite reject a second invoice with the same number, or create a duplicate? This decides how risky the after-send JRNY failure is.
3. **The three timestamps:**
   - SBDH `CreationDateAndTime`, `creationDateTime` and `documentEffectiveDate` are set to sending time, sending date and invoice date. The sample (29th 10:00, 30th, 29th) fits that loosely. Confirm with Shoprite or the old system's mapping.
4. **A Shoprite test environment:** is there one (the `b2b.shopriteholdings.co.za` help host?) where invoices can be posted safely?
5. **Zero-rated lines:** does AON ever invoice Shoprite for zero-rated items? If so, what category code does Shoprite expect?
