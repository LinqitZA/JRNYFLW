# Courier status sync (Nucleus → JRNY): design

**Date:** 2026-10-13
**Status:** Draft for review
**Depends on:**
- JRNY's updated dispatch notes list and Courier Response (API description fetched 2026-10-13);
- Nucleus Get PODs Extra (Bulk) (built);
- the MS Graph mail piece (`2026-10-13-ms-graph-mail-piece-design.md`).

## Purpose

Today a dispatch booked with Nucleus gets no update after the booking. JRNY users can't see when it was manifested or delivered, or who signed for it, without going to the Nucleus site.

This flow polls Nucleus for every Nucleus dispatch that JRNY still has on the road and sends each change back to JRNY:
- **manifested:** with the manifest date;
- **delivered:** with who signed, when, the POD link and the GRN.

It also emails IT about anything it can't match or can't send.

**Success:**
- within one polling interval of Nucleus recording a POD, the JRNY dispatch shows `delivered` with the POD signature, time and link;
- nobody has to re-key anything.

## What JRNY now provides

| Need | JRNY |
| --- | --- |
| Dispatches still on the road | `GET …/dispatch-notes?courierCode=…&courierStatus=booked,manifested,collected,in_transit` |
| Paging | `limit` up to 200, ascending dispatch-number cursor, `hasMore` (no total) |
| Row fields we use | `dispatchNumber`, `waybillNumber`, `courierStatus`, `courierCode`, `grnRequired`, `grnNumber` |
| Updating a dispatch | Courier Response with `manifested` / `delivered`, `manifestDate`, `podSignedBy`, `podSignedAt`, `podUrl`, `grnNumber`, `statusAt`, `trackingUrl` |
| Safe re-sends | The courier status only moves forward. The same or an earlier status is recorded but not applied (`applied: false`). |

## Piece work: JRNY "List Courier Dispatches"

The generated List Dispatch Notes returns one page, and its rows can't be matched to Nucleus results without code in the flow. A curated action does both.

**Inputs:**

| Input | Type | Default |
| --- | --- | --- |
| Courier Code | text, optional | (all couriers) |
| Courier Statuses | multi-select of `incomplete, pending, booked, manifested, collected, in_transit, delivered, failed` | booked, manifested, collected, in_transit |
| Only delivered without a POD | checkbox (`podMissing=true`) | off |
| Only delivered without a GRN | checkbox (`grnMissing=true`) | off |
| From Date | text `YYYY-MM-DD`, optional | — |
| If the call fails | the standard setting | Stop |

**Behaviour:**
- Fetches every page with `limit=200`, following `cursor` while `hasMore` is true.
- Stops with an error after 50 pages (10,000 dispatch notes) and asks for narrower filters. A sync that size means the filters are wrong.
- Fails on a page that isn't `{ data: [], hasMore }`, with "Unexpected response from JRNY".
- Rejects a From Date that isn't `YYYY-MM-DD` before calling JRNY.

**Output:**

```json
{
  "count": 3,
  "dispatchNotes": [ /* every row as JRNY returns it */ ],
  "waybills": "AON-50330006,AON-50330044",
  "byWaybill": { "AON-50330006": { /* that dispatch's row */ } }
}
```

- `waybills` is a comma-separated list of the rows that have a waybill, upper-cased and de-duplicated. It feeds Nucleus Get PODs Extra (Bulk) directly.
- `byWaybill` is keyed by that upper-cased waybill. In a loop over the Nucleus results, `{{step_1.output.byWaybill[loop_1.item.waybillNumber].dispatchNumber}}` gives the dispatch. Nucleus also upper-cases waybills, so the keys match.
- Rows without a waybill appear in `dispatchNotes` but not in `waybills` or `byWaybill`.

## The flow

```
Schedule: every 2 hours, 06:00–20:00 (adjust later)
1. JRNY · List Courier Dispatches
     Courier Code = <Nucleus's code in JRNY>, statuses booked, manifested, collected, in_transit
2. Router "Anything to check?"  count > 0   (otherwise the run ends)
   3. Nucleus · Get PODs Extra (Bulk)        Waybill Numbers = {{step_1.output.waybills}}
                                              If the call fails → Continue
   4. Router: step 3 ok is false → Send Email to IT ("Nucleus POD check failed: <error>") and stop the branch
   5. Loop on {{step_3.output.waybills}}
        Router (first match):
        ├─ Delivered     item.delivered is true
        │    Courier Response: Delivered
        │      Dispatch Number = byWaybill[item.waybillNumber].dispatchNumber
        │      POD Signed By / POD Signed At / POD URL / Tracking URL from item
        │      Status At = item.podSignedAt, Manifest Date = item.manifestDate,
        │      GRN Number = item.grvNumber
        │      If the call fails → Continue → on failure, Send Email to IT
        ├─ Manifested    item.manifestDate is not empty
        │                AND byWaybill[item.waybillNumber].courierStatus = booked
        │    Courier Response: Manifested, Manifest Date = item.manifestDate
        │      If the call fails → Continue → on failure, Send Email to IT
        └─ Otherwise     nothing (still on its way)
   6. Router: step 3 notFound is not empty → Send Email to IT listing the waybills Nucleus does not know
```

**Why these choices:**
- **Delivered dispatches drop out of the next poll,** because step 1 only asks for statuses before delivered. So each POD is sent once.
- **Manifested is sent only while JRNY still shows `booked`.** Without that check, every poll would re-send it, and JRNY would add a history row for each `applied: false` re-send.
- **No step throws inside the loop.** One bad dispatch must not stop the others. Failures go to IT by email, and the next poll retries them, because the dispatch is still on the road.
- **Nucleus has no collected or in-transit event in GetPODInformation_Bulk_Extra,** so this flow sends only manifested and delivered.

## Error handling

| Failure | What happens |
| --- | --- |
| JRNY list fails | The run fails (Stop). It's retried on the next schedule, and run history shows the call. |
| Nucleus fails | IT email with the error. Nothing is sent to JRNY. |
| Nucleus doesn't know a waybill | IT email listing the waybills. Usually a mistyped or cancelled waybill. |
| Courier Response fails for one dispatch | IT email with the dispatch, the waybill and the error. The loop carries on. |

## Out of scope (phase 2)

- **GRN catch-up:** a second pass with "Only delivered without a GRN", because Nucleus fills in `GRVNo` after delivery. Two blockers:
  - Nucleus hasn't filled in `GRVNo` on any waybill yet;
  - JRNY must confirm that a Delivered re-send (equal status, `applied: false`) still stores `grnNumber`.
- Collected and in-transit statuses, from Nucleus's tracking text.
- Other couriers.

## Open questions

1. What courier code does JRNY store for Nucleus bookings? It's needed for step 1's filter.
2. Who receives the IT emails, and from which mailbox? This needs the MS Graph mail piece connection.
3. Is every 2 hours, 06:00–20:00, right for the polling interval?
4. JRNY: is `grnNumber` stored on an equal-status re-send? (This only matters for phase 2.)

## Testing

- **List Courier Dispatches:** unit tests for:
  - paging (stops at `hasMore: false`, follows `cursor`);
  - the page cap;
  - the filters sent;
  - the date check;
  - `waybills` / `byWaybill` (upper-case, de-duplicated, rows without a waybill left out);
  - an unexpected response.
- **The flow:** built in the UAT builder and tested step by step against JRNY dev and Nucleus live, using dispatches already booked on Nucleus. Use the waybills from the POD test: AON-50330044 (delivered) and SHP-50330075 (not delivered).
