# JRNY dispatch → Nucleus booking

Design: `docs/superpowers/specs/2026-10-24-nucleus-booking-errors-design.md`.

**Importable version:** `docs/integrations/nucleus/courier-booking.flow.json`. Build it with:

```bash
bunx tsx scripts/uat/gen-nucleus-booking-flow.ts docs/integrations/nucleus/courier-booking.flow.json
```

The script also checks every field against the pieces, and runs the flow's expressions against sample runs (blank line 2, missing account number, unknown hubs, waybill already in Nucleus, address too long).

## What JRNY shows

| What happened | JRNY courier status | Detail |
| --- | --- | --- |
| Booked cleanly | Booked | Hub code and tracking URL; any old courier warning is cleared |
| A hub wasn't found for the sender or delivery address | Booked, hub UNK | Warning: `Sender hub not found, booked with hub UNK: <why>` (or `Delivery hub…`) |
| Waybill already in Nucleus (a resend after JRNY missed the update, or after a carton was re-measured) | Booked | Warning: `Waybill already existed in Nucleus, parcels not checked.` Parcels aren't re-sent |
| Hub lookup call to Nucleus failed | Failed | `Find hub code: sender address: …` or `… delivery address: …` |
| Courier account number blank in JRNY | Failed | `Create waybill: the courier account number is missing in JRNY` |
| An address field over 50 characters | Failed | `Create waybill: Too long for Nucleus (max 50 characters): …`, listing **every** long field, plus a hint mapping the Nucleus fields to JRNY's |
| Nucleus refused the waybill for another reason | Failed | `Create waybill: <Nucleus's message>` |
| Waybill created, parcels refused | Failed | `Add parcels: …`. Add the parcels in Nucleus by hand: a resend would mark it booked without them |
| JRNY couldn't be told (even after retrying rate limits for about a minute) | stays "awaiting booking" | The run shows as failed in JRNYFLW. Press resend in JRNY: it lands on "already exists" and books with the warning |

After a **Failed** report the run itself shows as successful. This fork has no "stop as failed" step without adding a code step, and the failure is where staff look: in JRNY. Each Nucleus step's output in the run also shows the full error.

Fix-and-resend loop: fix the customer's address book (or warehouse, or courier settings) in JRNY, refresh the dispatch's delivery address, then press **Resend courier webhook**. The waybill number stays the same.

## Address mapping

| Nucleus field | From JRNY |
| --- | --- |
| Sender Address 1 | warehouse address line 2, or suburb when blank |
| Sender Address 2 | warehouse address line 1 |
| Sender Address 3 / 4 | warehouse suburb / city |
| Receiver Address 1 | delivery line 1 |
| Receiver Address 2 | delivery line 2, or suburb when blank |
| Receiver Address 3 / 4 | delivery suburb / city |

Sender lines 1 and 2 are swapped. That's kept from the flow this replaces, so check it's what you want. A blank line 2 is filled with the suburb because JRNY leaves line 2 optional and expects the integration to do this. Nothing else is altered or shortened.

## Steps

| # | Step | Settings |
| --- | --- | --- |
| trigger | Webhook, Catch Webhook | HMAC: header `x-webhook-signature`, SHA-256, hex, no prefix. **Secret is blank in the file** |
| 4 | Nucleus · Find Hub Code (sender) | If no hub: Use UNK. If the call fails: Continue (plus Continue on failure) |
| 1 | Nucleus · Find Hub Code (delivery) | same |
| 6 | Router: Ready to book? | both hubs ok and courier account number set |
| 2 | Nucleus · Create Staged Waybill | mappings above. If the call fails: Continue (plus Continue on failure) |
| 8 | Router: Header created? | `step_2.ok` |
| 3 | Nucleus · Add Staged Waybill Parcels | Cartons from JRNY, 1 item per carton. Continue |
| 9 | Router: Parcels added? | `step_3.ok` |
| 10 | JRNY · Courier Response: Booked | hub code, tracking URL, hub warnings. If the call fails: Stop |
| 11 | JRNY · Courier Response: Failed (parcels) | step `Add parcels` |
| 12 | Router: Already in Nucleus? | step 2's error contains `already exists` |
| 13 | JRNY · Courier Response: Booked (already in Nucleus) | "already existed" warning plus any hub warnings |
| 14 | JRNY · Courier Response: Failed (waybill) | step `Create waybill` |
| 7 | JRNY · Courier Response: Failed (not booked) | step `Find hub code` or `Create waybill` |

## Importing

1. **Import into the existing booking flow** (open it, flow menu → Import), not as a new flow. That keeps the webhook URL JRNY already calls.
2. Pick the **Nucleus** connection on steps 4, 1, 2 and 3, and the **JRNY** connection on steps 10, 11, 13, 14 and 7. The file has placeholders on purpose.
3. On the trigger, paste the webhook secret. Use a **rotated** one: the old one was shared in plain text. Rotate it in JRNY's webhook subscription first.
4. Publish, then test on dev before live (see below).

**Dev test:** wire a dev flow to the Nucleus test environment and a dev JRNY, then resend dev dispatches to cover:
- a clean booking;
- a waybill already staged in Nucleus test;
- a delivery line 2 over 50 characters;
- an unknown suburb.

Check JRNY's courier column each time. This also confirms the flow's expressions run in the engine.

## Still open with Nucleus

- Access to `GetWaybillinformation` for our login, so "already exists" can check the parcels instead of warning.
- What a second parcels call on the same waybill does (duplicate or refuse). When both are answered, "already exists" can verify or add the parcels and drop the warning.
