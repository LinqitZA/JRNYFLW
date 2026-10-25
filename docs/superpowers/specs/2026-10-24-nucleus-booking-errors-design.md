# Nucleus courier booking: trap errors and report them to JRNY

Date: 2026-10-24. Status: design, awaiting approval.

## Why

When JRNY finishes a dispatch it sends the `shipping.ready_for_courier` webhook. A JRNYFLW flow books the waybill in Nucleus (Winfreight) and tells JRNY it is booked. Today that flow traps nothing. Every step stops the run on failure, so when a booking fails, JRNY never hears about it. The dispatch sits at "awaiting booking" indefinitely, isn't flagged as needing attention, and nothing retries it (JRNY counts the webhook as delivered as soon as the flow accepts it).

Two failures from live show the problem:

- `Nucleus error: ERROR - Waybill Import Header, with Waybill No - CBR50331729 - already exists!` An earlier run booked the waybill in Nucleus but failed to update JRNY. Someone pressed resend, and the second run failed on the duplicate.
- `Nucleus error: ERROR - String or binary data would be truncated in table 'Winfreight_Nucleus_Access.dbo.Import_Waybill_Header', column 'Dest_Address02'. Truncated value: '...'` Nucleus address columns hold 50 characters. Staff never saw this in JRNY.

The goal: every outcome of a booking attempt reaches JRNY, with enough detail for staff to act on it.

## Goals

- Every failure is reported to JRNY as courier status **Failed**, naming the step that failed and the reason.
- Address problems go back to JRNY so the source address can be fixed. **Nothing is shortened or altered to make it fit** (user decision).
- "Waybill already exists" in Nucleus is treated as **booked**, with a courier warning (user decision, see below).
- A hub code that can't be found doesn't stop the booking: book with hub **UNK** and a courier warning (user decision).
- The JRNY update itself survives JRNY rate limits (429).

## Non-goals

- No change to JRNY. Its courier response endpoint already stores everything this needs.
- No automatic retry of a failed Nucleus booking. JRNY's repair loop covers that: staff fix the address book, refresh the dispatch's delivery address, and press resend. The resend keeps the same waybill number.
- No parcel check on "already exists". It isn't possible yet (see Constraints).
- No deletion of waybills in Nucleus.

## Anti-goals

- Silently truncating or rewriting address data.
- Any failure that ends without JRNY knowing, unless the JRNY update itself is what failed (see the Booked and Failed steps below).
- Secrets in any generated or committed file. The user's pasted export of the current flow contained the webhook HMAC secret in plain text. The generated flow uses placeholder connections and leaves webhook auth for the user to set (with a rotated secret).

## How JRNY behaves (verified in `~/repo/jrny`, not changed by this work)

- The webhook fires only when a dispatch moves to `ready_to_dispatch`. Only Pack Complete can start that, and only with 100% pack reconciliation. In warehouses that measure at shipping, it fires once, when the last live carton is measured, and a guarded UPDATE stops a double fire. A carton measured while packing is still in progress doesn't trigger it. **So there's no race between packing and the courier call.**
- If a measured carton is reopened and measured again before posting, JRNY sends the webhook again **with the same waybill number**, possibly with different cartons. This is a second source of "already exists".
- JRNY's courier readiness check requires sender name, telephone, address1, suburb, city and postal code, and receiver name, contact name, contact phone, line1, suburb, city and postal code. **Address line 2 is deliberately not required** (`courier-payload.ts`): "repeating the suburb when there is none is JRNYFLW's job". The current flow maps line 2 directly to required Nucleus fields, so a dispatch without line 2 fails today.
- Courier Response (`PATCH /dispatch-notes/{dispatchNumber}/courier-response`, `@jrnyflw/jrny` action `courier_response`):
  - **Failed** records `errorMessage` (format `<Step>: <reason>`) and `failedStep` (max 60) without changing the status.
  - **Booked** takes `hubCode` (max 20), `trackingUrl` (max 500) and `courierWarning`. A later Booked without a warning clears an earlier one.
  - Status only moves forward. Re-sending a status it already has returns `applied:false`, which isn't an error.
- Resend is blocked once a dispatch is booked.

## Constraints

- Nucleus returns errors as HTTP 200 with an error message in the result sets. The piece client turns them into `Nucleus error: <message>`.
- Header and parcels are two separate calls (`create_waybill_import_header`, then `create_waybill_import_dims_and_detail`), so a run can stop between them.
- Our Nucleus login can't read parcels back on live: `GetWaybillinformation` and `GetLabel` return 401 "Insufficient access". `GetTracking` shows no parcel detail. There's no update endpoint for a staged header. So "already exists" can't be checked today.
- What a second parcels call does on the same waybill (duplicate or refuse) is unknown.
- Nucleus address columns hold 50 characters. This is confirmed for `Dest_Address02`, and Nucleus uses the same width for the other address columns. Other column widths aren't documented.
- The Activepieces engine validates required props **before** the piece's own failure handling runs. An empty required field (for example Receiver Address 2) fails the step even when its "If the call fails" option is set to Continue.
- Every `@jrnyflw/nucleus` and `@jrnyflw/jrny` action already has an "If the call fails" option (`pieceTrace`). With Continue, the step succeeds with `{ ok: false, error: { message, status, code? } }` so a Router can branch on it. With Stop, the run fails.

## What changes

### 1. Piece change: address length check in Create Staged Waybill (`@jrnyflw/nucleus`)

`create-waybill-import-header.ts` checks field lengths **before** calling Nucleus. If any field is too long, it fails with one message that lists **every** offending field: its label, its length, the limit, and the value. Without this check, Nucleus reports only the first column it hits, so staff would fix one field, resend, and hit the next.

- At minimum it covers the eight address fields (Sender Address 1-4, Receiver Address 1-4) at 50 characters.
- The failure goes through `pieceTrace` like any other, so with Continue the flow gets it as `{ ok: false, error }`.
- Give the error a distinct `code` (the builder picks the name) so the flow and the tests can tell it apart from a Nucleus refusal.
- The message must let staff find the field in JRNY. Each Nucleus field label should map clearly to a JRNY address field: for example, "Receiver Address 2" is the delivery address's line 2 (or its suburb, when line 2 is blank; see section 3).

### 2. Piece change: rate-limit retry on Courier Response (`@jrnyflw/jrny`)

`courier-response.ts` wraps its call in `jrnyBackoff.withBackoff` (`src/lib/backoff.ts`; on 429 it waits 2, 4, 8, 16 and 32 s), the same way `record-invoice-result.ts` does. Other errors fail exactly as before.

### 3. The booking flow, regenerated

A generator script produces an importable flow file in the same style as `scripts/uat/gen-shoprite-orders-flow.ts`: piece and router helpers, placeholder connections, and a self-check of step settings. It writes `docs/integrations/nucleus/courier-booking.flow.json`, documented in `docs/integrations/nucleus/booking-flow.md`.

The order and field mappings stay as in the user's current flow, with the changes listed after the table.

**Current flow, step by step.** Taken from the user's export. Connections and webhook auth are left out; every value comes from the webhook body `trigger.body.data` (written `d.` below), and none are constants.

| Step | Action | Inputs |
|---|---|---|
| trigger | `@activepieces/piece-webhook` `catch_webhook` | webhook auth (HMAC header `x-webhook-signature`; set by the user) |
| step_4 | nucleus `find_hub_code_for_address` (sender) | city, suburb, province, postalCode ← `d.sender.*` |
| step_1 | nucleus `find_hub_code_for_address` (delivery) | city, suburb, province, postalCode ← `d.deliveryAddress.*` |
| step_2 | nucleus `create_waybill_import_header` | see below |
| step_3 | nucleus `create_waybill_import_dims_and_detail` | waybillNo ← `d.waybillNumber`; itemsField `one`; cartonsJson ← `d.cartons`; parcels `[]` |
| step_5 | jrny `courier_response` | courierStatus `booked`; waybillNumber ← `d.waybillNumber`; dispatchNumber ← `d.dispatchNumber` |

The step_2 inputs:
- waybillNo ← `d.waybillNumber`, waybillDate ← `d.waybillDate`, servCode ← `d.serviceCode`
- noParcels ← `d.totalCartons`, weight ← `d.totalGrossWeightKg`, accNum ← `d.courierAccountNumber`
- accName ← `d.sender.name`, accTelNo ← `d.sender.telephone`
- accAddress1 ← `d.sender.address2`, accAddress2 ← `d.sender.address1` (swapped; keep as-is), accAddress3 ← `d.sender.suburb`, accAddress4 ← `d.sender.city`, accPostalCode ← `d.sender.postalCode`
- origCode ← step_4 `hubCode`, destCode ← step_1 `hubCode` (Activepieces' `stepN.output` is the trace result's `output`)
- destName ← `d.customerName`, contactName ← `d.deliveryAddress.contactName`, contactTelNo ← `d.deliveryAddress.contactPhone`, destAccNum ← `d.deliveryAddress.addressCode`
- destAddress1 ← `d.deliveryAddress.line1`, destAddress2 ← `d.deliveryAddress.line2`, destAddress3 ← `d.deliveryAddress.suburb`, destAddress4 ← `d.deliveryAddress.city`, destPostalCode ← `d.deliveryAddress.postalCode`
- reference ← `d.customerPONumber`, customerPONumber ← `d.customerPONumber`

**Which required header fields can arrive blank.** JRNY's readiness check guarantees every mapped field except three:
- `d.sender.address2` → Nucleus Sender Address 1
- `d.deliveryAddress.line2` → Receiver Address 2
- `d.courierAccountNumber` → Sender Account Number

Both address 3 and address 4 are suburb and city, which JRNY requires, and JRNY also checks carton dimensions and weights. Province only feeds the hub lookups, where it's optional.

The changes:

**Hub codes (sender and delivery).**
- Keep "If no hub code is found" = Use UNK. That's already the default, so today UNK bookings happen silently.
- Set "If the call fails" = Continue.
- When a lookup returns `matchedOn: "fallback"`, the Booked update carries a courier warning naming the side and the address, built from the lookup's `reason`. For example: "Delivery hub not found for Ballito 4399, booked with hub UNK".
- Applying UNK to the sender as well as the delivery side is my call: a warehouse address that won't resolve then shows on every booking.
- A failed call to Nucleus (as opposed to "not found") → Failed, with step "Find hub code".

**Create Staged Waybill (header).**
- Set "If the call fails" = Continue.
- Map Receiver Address 2 to `d.deliveryAddress.line2`, or the delivery suburb when line 2 is blank. Map Sender Address 1 to `d.sender.address2`, or the sender suburb when it's blank. This follows JRNY's own rule ("repeating the suburb when there is none is JRNYFLW's job"), so it doesn't count as altering the address. The builder picks how (for example a small Code step, or a template expression), but Nucleus must never receive an empty required field.
- A blank `d.courierAccountNumber` → Failed, with step "Create waybill" and a message saying the courier account number is missing in JRNY. Check it before the header call, because the engine would otherwise fail the step on the empty required prop before the piece's Continue handling runs. Handling it this way is my call.
- The current flow maps sender address1/address2 to Nucleus Address 2/1 (swapped). Keep that, since it's the user's mapping; flag it in the doc.
- Outcomes:
  - **ok** → add the parcels.
  - **error message contains "already exists"** → skip the parcels and go straight to Booked, with the courier warning "Waybill already existed in Nucleus, parcels not checked". Skipping the parcels is my call: sending them again might duplicate them, and that behaviour is unknown. Matching on Nucleus's text is also my call, since it's the only signal Nucleus gives.
  - **address length error** (section 1) → Failed, with step "Create waybill" and the piece's message.
  - **anything else** → Failed, with step "Create waybill" and the error message.

**Add Staged Waybill Parcels.** Set "If the call fails" = Continue.
- **ok** → Booked.
- **error** → Failed, with step "Add parcels" and the error message. The message must say that the header was created but the parcels weren't, because a resend will then hit "already exists" and be marked booked with the warning. Staff need to know the parcels must be added in Nucleus by hand.

**Booked (Courier Response).**
- Send status booked, the waybill number, `hubCode` (delivery hub) and `trackingUrl` (from the header step's output).
- Send `courierWarning` only when there is one. Join several warnings, for example UNK on both sides, or UNK plus "already existed". With no warning the field is omitted, so a clean booking clears an old warning.
- "If the call fails" = **Stop**, so a failed JRNY update shows as a failed run in JRNYFLW. With the 429 retry this should be rare. When it happens, the dispatch stays "awaiting booking" in JRNY, and a resend lands on "already exists" → booked with a warning.

**Failed (Courier Response).**
- Send status failed, `errorMessage` as `<Step>: <reason>`, and `failedStep`. Step names are "Find hub code", "Create waybill" and "Add parcels".
- "If the call fails" = Stop.
- After reporting Failed, the run ends. Whether it should show as failed or successful in run history is left to the builder. Prefer failed, so failures are easy to find. The `pieceTrace` note says a failure branch may end with a failing step outside a loop, and this flow has no loop.

**Required props.** Because the engine checks required props first, any step whose required inputs could be empty must either never get an empty value (as with the line 2 fallback) or set `continueOnFailure` at the engine level. The builder decides per step and covers it in the generator's self-check.

## Left to the builder

- Exact router layout and step names. Error message wording beyond what's stated above.
- The error `code` name for the length check, and whether to check any field beyond the eight address fields.
- How the line 2 fallback is expressed in the flow.
- Tests: unit tests for the length check (several fields too long → one message listing all of them; boundary at exactly 50) and for Courier Response retrying on 429 and not on other errors. Plus the generator's self-check. Run `npm run lint-dev`.
- Release notes: re-import steps and the connections to reattach (Nucleus on steps 4, 1, 2 and 3; JRNY on the courier response steps; webhook auth with the rotated secret).

## Later, outside this work

Ask Nucleus for (1) `GetWaybillinformation` access for our login, so "already exists" can check parcels, and (2) what a second parcels call on the same waybill does. When both are answered, "already exists" can verify the parcels, or add them if they're missing, and drop the warning.
