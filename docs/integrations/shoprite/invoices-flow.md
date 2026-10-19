# Shoprite invoices from JRNY: the flow

Design: `docs/superpowers/specs/2026-10-17-shoprite-invoices-design.md`.

**Importable version:** `docs/integrations/shoprite/shoprite-invoices.flow.json`. It's built by:

```bash
bunx tsx scripts/uat/gen-shoprite-invoices-flow.ts docs/integrations/shoprite/shoprite-invoices.flow.json --from-date YYYY-MM-DD
```

The generator also checks every field against the pieces.

## The one setting that matters: From Date

**From Date (step 1) must be the switch-over date.**
- The old platform sent every invoice before that date.
- JRNY still lists those invoices as unsent, so an earlier date sends them to Shoprite a second time.
- A later date leaves the invoices in between unsent.

The switch-over date is **20 Oct 2026** (confirmed), and the committed file uses `2026-10-20`. To change it, regenerate with `--from-date`, or edit step 1 after importing.

## Before importing

1. **Shoprite connection:** production, with **Supplier GLN** and **VAT Registration Number** filled in. Connections can't be edited yet, so create a new one if these are blank. Send Invoice fails every invoice with INVALID without them.
2. **JRNY connection:** production. The key needs `finance.delivery.write` to record results.
3. **Switch off the old platform's invoice sending** before turning this flow on.

After importing, pick both connections on every Shoprite and JRNY step. The file has placeholders on purpose.

## The steps

| # | Step | Settings |
| --- | --- | --- |
| trigger | Schedule, cron | `0 7-19 * * *`, Africa/Johannesburg (hourly, 07:00–19:00) |
| 1 | JRNY · List Invoices Ready to Send | Customer `SHOE100`; From Date = switch-over date; Max Invoices 50. If the call fails: Stop |
| 2 | Router | `{{step_1.output.count}}` > 0 |
| 3 | Loop on Items | `{{step_1.output.invoices}}` |
| 4 | Router "Clean?" | `{{step_3.item.clean}}` is true |
| 5 | Shoprite · Send Invoice | Fields from `step_3.item`; Lines in list-mapper mode from `step_3.item.lines`. If the call fails: Continue |
| 6 | Router "Sent?" | `{{step_5.ok}}` is true |
| 7 | JRNY · Record Invoice Result | Sent; External Reference `{{step_5.output.invoiceRefNo}}` |
| 8 | JRNY · Record Invoice Result | Failed; Error Code `{{step_5.error.code}}`; Message `{{step_5.error.message}}` |
| 9 | JRNY · Record Invoice Result | Failed; Error Code `INVALID`; Message `{{step_3.item.problem}}` |

Steps 5, 7, 8 and 9 have **Continue on Failure** on, so one bad invoice never stops the others.

## What staff see in JRNY, and what to do

Every result shows on the invoice's API delivery status.

| JRNY shows | Meaning | What to do |
| --- | --- | --- |
| Sent | Shoprite confirmed "1 record was successfully inserted" | Nothing |
| Failed, `INVALID: Line 2 (TRI200, BOX): no Shoprite GTIN in JRNY` | The product has no GTIN-type barcode for that unit | Load the GTIN in JRNY. The next run sends it |
| Failed, `INVALID: Delivery address 1608 has no GLN in JRNY` | The store's delivery address has no GLN | Load the GLN. The next run sends it |
| Failed, `INVALID: …` (anything else) | The invoice doesn't add up or is missing a field | Correct the invoice. It goes again next run |
| Failed, `REJECTED: …` | Shoprite refused it | Read Shoprite's message. It goes again next run |
| Failed, `UNCONFIRMED: …` | Shoprite didn't confirm it or didn't answer. **It may have arrived** | **Not resent automatically.** Check in Shoprite. If it isn't there, reset the invoice in JRNY and the next run sends it |

**Not sent yet, with nothing recorded:**
- invoices with no customer PO;
- invoices whose dispatch has no POD yet.

Step 1's `waiting` output counts them per reason. JRNY's `shipping.delivered` event isn't used, because it fires when the invoice is raised, not on delivery.

## Testing

- **Never test Send Invoice against Shoprite production with a made-up invoice.**
- Test step 1 against JRNY. It only reads, and its output shows what would go.
- For the first live invoice, pick one clean, delivered invoice and agree on it with AON first.
