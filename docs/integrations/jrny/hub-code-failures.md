# Hub code failures in courier booking

2026-10-12 · Aadil Aboobaker

When Nucleus can't place a dispatch's delivery address in a hub, JRNYFLW now books it with hub code UNK (Unknown) instead of failing. A booking only fails when the call to Nucleus itself fails. JRNY needs two changes so both cases show on the dispatch shipping screen.

## The two outcomes

The Find Hub Code step tries the suburb and postal code together, then the suburb alone, then the postal code, then the city. It falls back to UNK only when none of these gives exactly one hub.

| Situation | What JRNYFLW does | What JRNY receives | Dispatch status |
| --- | --- | --- | --- |
| Address matches no hub, matches several hubs, or has no suburb, postal code or city | Books the waybill with hub code UNK | Courier Response `booked` with the waybill, as for any booking. JRNY can't be told about the UNK yet (Change 2). | Moves on as for any booking |
| A call to Nucleus fails: login, HTTP error, or a Nucleus error row | Stops; nothing is booked | Courier Response `failed` with `errorMessage` set to `Find Hub Code: <reason>` (Change 1) | Stays `awaiting_booking` |

The same `failed` response is sent when a later booking step fails, such as Create Waybill. The step name at the start of `errorMessage` says which stage failed.

## Change 1: accept and store a failed booking

Today the courier response endpoint only accepts a dispatch in `ready_to_dispatch`, `dispatched` or `invoiced`. It uses `errorMessage` only in the failure notification. So a `failed` response for a dispatch that is still awaiting booking is rejected, and the shipping screen shows nothing.

JRNY needs to:

1. Accept `courierStatus: failed` while the dispatch is in `awaiting_booking`, and return 200.
2. Leave the dispatch status as `awaiting_booking`.
3. Store `errorMessage` and the time it arrived on the dispatch (for example a last courier error and its timestamp; the field names are JRNY's choice).
4. Show that error on the dispatch shipping screen.
5. Clear it, or mark it resolved, when a `booked` response later arrives for the same dispatch, for example after the run is retried.

The request JRNYFLW sends:

```http
PATCH /api/v1/integration/entities/{entityId}/dispatch-notes/{dispatchNumber}/courier-response
Content-Type: application/json

{
  "courierStatus": "failed",
  "errorMessage": "Find Hub Code: HTTP 401: {\"error\":\"invalid_grant\"}"
}
```

`errorMessage` is always `<Step>: <reason>`. The reason takes one of these forms:

| Cause | Reason text |
| --- | --- |
| Nucleus returned an HTTP error | `HTTP <status>: <response body>` |
| Nucleus did not respond (network error or timeout) | `HTTP 500 with no response body` |
| Nucleus returned an error row | `Nucleus error: <Nucleus message>` |

JRNYFLW does not cap the message length, because the Nucleus response body is included as-is. Store it as text and shorten it on screen if needed. Passwords and tokens are always removed before the message is sent.

## Change 2: show bookings made with UNK

A dispatch booked with UNK is a valid booking, but its address didn't match a Nucleus hub, so someone should check the delivery address. The courier response has no field that can carry this today.

Proposal: add two optional fields to the courier response, which JRNYFLW sends with the `booked` response:

```json
{
  "courierStatus": "booked",
  "waybillNumber": "AON-50330110",
  "hubCode": "UNK",
  "courierWarning": "Booked with unknown hub: No single Nucleus hub code found for this address (tried Suburb=Nowhere + Postal=7460; Suburb=Nowhere; Postal=7460). Ambiguous: Postal=7460 matches hubs CPT, WC1."
}
```

- `hubCode`: the hub the waybill was booked to. It's sent on every booking, not only UNK ones.
- `courierWarning`: free text, sent only when something needs a person to look. Show it on the shipping screen as a warning; it does not change the dispatch status.

The names are a suggestion; JRNY can choose its own. JRNYFLW will add these fields to the flow once JRNY confirms the names and that the endpoint accepts them.

## Checklist for the JRNY team

- [ ] Accept `courierStatus: failed` on a dispatch in `awaiting_booking` without changing its status
- [ ] Store the `errorMessage` and when it arrived on the dispatch
- [ ] Show the last booking error on the dispatch shipping screen
- [ ] Clear or resolve the error when a later `booked` response arrives
- [ ] Agree field names for the hub code and booking warning (Change 2) and accept them on the courier response
- [ ] Show the booking warning on the shipping screen
- [ ] Tell JRNYFLW when these are live in UAT so the courier flow can be updated and tested end to end

Open questions:

- Should a dispatch booked with UNK also raise a notification, like a failed booking does?
- Should the shipping screen keep a history of booking errors, or only the latest one?
