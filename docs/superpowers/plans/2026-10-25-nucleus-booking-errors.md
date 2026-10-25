# Nucleus Booking Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every outcome of a Nucleus courier booking reaches JRNY: Failed with step and reason, or Booked (with a warning when the booking needs a look).

**Architecture:** Two small piece changes:
- `@jrnyflw/nucleus`: an address length check before the header call.
- `@jrnyflw/jrny`: a 429 back-off on Courier Response.

A new generator script builds the importable booking flow. It uses nested Routers on each step's `{ ok, error }` result (the existing "If the call fails = Continue" option), and engine template expressions (`{{ JS }}`, evaluated by `props-resolver.ts` `evalInScope`) for the line 2 fallback, the warnings and the failure messages. The generator's self-check evaluates those expressions against sample run states.

**Tech Stack:** TypeScript, Activepieces pieces framework, vitest, bunx tsx.

**Spec:** `docs/superpowers/specs/2026-10-24-nucleus-booking-errors-design.md` (approved 2026-10-24). Read it first; the field mapping table there is the source for Task 3.

## Global Constraints

- No `any`, no `as` casts, named (destructured) params for functions with more than one param, exported types/consts at the end of the file, comments only for *why*.
- No secrets in any committed file. Generated connections are placeholders (`{{connections['pick-the-...-connection']}}`), and the webhook HMAC secret is `''`.
- Address data is never shortened or altered, except for JRNY's own rule: a blank line 2 is filled with the suburb.
- Nucleus address columns hold **50** characters.
- Courier Response step names are exactly `Find hub code`, `Create waybill` and `Add parcels`. `errorMessage` is `<Step>: <reason>`.
- Warning text, exactly:
  - `Waybill already existed in Nucleus, parcels not checked.`
  - `Sender hub not found, booked with hub UNK: <reason>`
  - `Delivery hub not found, booked with hub UNK: <reason>`
- Back-off waits are 2, 4, 8, 16 and 32 s, on 429 only (the existing `jrnyBackoff.withBackoff`).
- Piece versions stay `0.1.0`. Flow `pieceVersion` is `'0.1.0'` for the custom pieces, and `0.1.33` for `@activepieces/piece-webhook`.
- Work on branch `nucleus-booking-errors`, cut from `main`, and commit the spec and this plan as its first commit.
- Before finishing: `npm run lint-dev`. Commit only on the branch; the user pushes from their own shell. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A blank `deliveryAddress.line2` or `sender.address2`** (JRNY allows both): the header gets the suburb instead, and the run never dies on an empty required prop. Pinned by Task 3's expression samples.
2. **A header that fails before any call is sent** (an engine prop failure with `continueOnFailure`, so `step_2` has no `error.message`): the Failed message still says something useful, not an empty string. Pinned by Task 3's samples (`step_2` undefined).
3. **"already exists" plus a hub UNK on the same run:** both warnings are joined into one `courierWarning`. Pinned by Task 3's samples.
4. **Several address fields too long at once, including exactly 50:** one message lists only the fields over 50. Pinned by Task 1's tests.
5. **A 429 on Courier Response that never clears:** the error surfaces after the last wait instead of looping. Pinned by Task 2's tests.

---

### Task 1: Address length check in Create Staged Waybill (`@jrnyflw/nucleus`)

**Files:**
- Create: `packages/pieces/custom/nucleus/src/lib/field-lengths.ts`
- Modify: `packages/pieces/custom/nucleus/src/lib/actions/create-waybill-import-header.ts` (inside `work`, before `nucleusClient.call`)
- Test: `packages/pieces/custom/nucleus/test/staged-waybill.test.ts` (new `describe('address length check')`)

**Interfaces:**
- Produces:
  - `nucleusFieldLengths.findTooLong({ fields }: { fields: { label: string; value: string }[] }): TooLongField[]`, where `TooLongField = { label: string; length: number; value: string }`, keeps input order, and the limit is 50.
  - `class FieldsTooLongError extends Error { readonly code = 'NUCLEUS_FIELDS_TOO_LONG' }`, built from `TooLongField[]`. `pieceTrace`'s `errorFacts` copies a string `code` onto `TraceError.code`, so the flow sees `stepN.error.code === 'NUCLEUS_FIELDS_TOO_LONG'`.
  - The message format (exact): `Too long for Nucleus (max 50 characters): <label> is <length>: '<value>'; <label> is <length>: '<value>'`.
- Labels are the action's prop display names: `Sender Address 1`…`Sender Address 4` and `Receiver Address 1`…`Receiver Address 4`. Only those eight fields are checked.

- [ ] **Step 1: Write the failing tests** in `staged-waybill.test.ts`. Reuse the existing header `propsValue` from the first test, as a shared const:

```ts
test('refuses before calling Nucleus and lists every address field over 50 characters', async () => {
    sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
    const propsValue = { ...headerProps, destAddress2: 'x'.repeat(63), accAddress1: 'y'.repeat(51), destAddress1: 'z'.repeat(50), onFailure: 'continue' };
    const result = await createWaybillImportHeader.run({ ...createMockActionContext({ propsValue }), auth });
    expect(result).toMatchObject({ ok: false, error: { code: 'NUCLEUS_FIELDS_TOO_LONG' } });
    expect(result.ok === false && result.error.message).toBe(
        `Too long for Nucleus (max 50 characters): Sender Address 1 is 51: '${'y'.repeat(51)}'; Receiver Address 2 is 63: '${'x'.repeat(63)}'`,
    );
    expect(sendRequest.mock.calls.some(([req]) => String(req.url).endsWith('CreateWaybillImportHeader'))).toBe(false);
});

test('a field of exactly 50 characters is sent', async () => {
    sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
    sendRequest.mockResolvedValueOnce({ body: 'OK' });
    await createWaybillImportHeader.run({ ...createMockActionContext({ propsValue: { ...headerProps, destAddress1: 'z'.repeat(50) } }), auth });
    expect(lastRequest().queryParams.Dest_Address01).toBe('z'.repeat(50));
});
```

Plus a pure test for `nucleusFieldLengths.findTooLong`: given labels A (50 chars), B (51) and C (''), it returns `[{ label: 'B', length: 51, value: 'b…' }]`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd packages/pieces/custom/nucleus && bunx vitest run test/staged-waybill.test.ts`
Expected: the 3 new tests FAIL (no module `field-lengths`, or the header still calls Nucleus).

- [ ] **Step 3: Implement** `field-lengths.ts`: the `findTooLong` function, then `export const nucleusFieldLengths = { findTooLong }`, then the `FieldsTooLongError` class, `TooLongField` type and `NUCLEUS_ADDRESS_MAX_LENGTH = 50` at the end of the file. In the header action, build the eight `{ label, value }` pairs from `p`, and `throw new FieldsTooLongError(...)` inside `work` when the list isn't empty. Count characters with `.length` on the value exactly as it will be sent: the header sends values untrimmed today, so don't trim.

- [ ] **Step 4: Run the whole piece suite**

Run: `cd packages/pieces/custom/nucleus && bunx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/nucleus/src/lib/field-lengths.ts packages/pieces/custom/nucleus/src/lib/actions/create-waybill-import-header.ts packages/pieces/custom/nucleus/test/staged-waybill.test.ts
git commit -m "feat(nucleus): Create Staged Waybill refuses address fields over 50 characters and lists them all in one message"
```

### Task 2: 429 back-off on Courier Response (`@jrnyflw/jrny`)

**Files:**
- Modify: `packages/pieces/custom/jrny/src/lib/actions/courier-response.ts` (the `jrnyClient.callJrny` call in `work`)
- Test: `packages/pieces/custom/jrny/test/courier-response.test.ts`

**Interfaces:**
- Consumes: `jrnyBackoff.withBackoff(call)` from `src/lib/backoff.ts` (unchanged).
- Produces: no signature change.

- [ ] **Step 1: Write the failing tests.** Copy the 429 `HttpError` construction from `record-invoice-result.test.ts:38-53`, and use `vi.useFakeTimers()` with `vi.useRealTimers()` in `afterEach`.
  - `retries a 429 and books once JRNY accepts`: the first call rejects with 429 and the second resolves `{ body: {} }`. Advance 2000 ms. Expect `result.ok` true and `sendRequest` called 2 times, with identical body and url both times.
  - `gives up after the last wait when JRNY keeps answering 429`: always 429, with `onFailure: 'continue'`. Advance 62000 ms (2+4+8+16+32). Expect `result.ok` false, `result.error.status` 429 and `sendRequest` called 6 times.
  - `does not retry a 400`: a single 400 rejection with `onFailure: 'continue'`. Expect `ok` false and 1 call, without advancing any timers.

- [ ] **Step 2: Run them and see them fail**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/courier-response.test.ts`
Expected: the first two new tests FAIL (only 1 call made); the 400 test passes.

- [ ] **Step 3: Implement.** Wrap the call: `return jrnyBackoff.withBackoff(() => jrnyClient.callJrny({ trace, auth, method: HttpMethod.PATCH, path, body }))`.

- [ ] **Step 4: Run the whole piece suite**

Run: `cd packages/pieces/custom/jrny && bunx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/jrny/src/lib/actions/courier-response.ts packages/pieces/custom/jrny/test/courier-response.test.ts
git commit -m "feat(jrny): Courier Response waits and retries when JRNY rate-limits it"
```

### Task 3: Booking flow generator, flow file and doc

**Files:**
- Create: `scripts/uat/gen-nucleus-booking-flow.ts`
- Create (generated): `docs/integrations/nucleus/courier-booking.flow.json`
- Create: `docs/integrations/nucleus/booking-flow.md`

**Interfaces:**
- Consumes:
  - `FieldsTooLongError` code `'NUCLEUS_FIELDS_TOO_LONG'` (Task 1).
  - The action props of `findHubCodeForAddress`, `createWaybillImportHeader`, `createWaybillImportDimsAndDetail` and `courierResponse`, for the prop-name check.
  - `SharedTemplate` from `packages/shared/src/lib/management/template/template`.
- Produces: the flow file; usage `bunx tsx scripts/uat/gen-nucleus-booking-flow.ts docs/integrations/nucleus/courier-booking.flow.json`.

Model the script on `scripts/uat/gen-shoprite-orders-flow.ts`. Copy its `piece()`, `router()`, `findStep()` and `isRecord()` helpers, and its prop-name check plus `SharedTemplate.safeParse` self-check. Differences:
- `piece()` takes `continueOnFailure: boolean`, instead of `inLoop`.
- The router helper must also allow `otherwise` to be a chain, as it already does.

**Flow shape.** `d` = `trigger['body']['data']`. Each step's result is `{ ok, output, error }`. Connections:
- `NUCLEUS = "{{connections['pick-the-nucleus-connection']}}"`
- `JRNY = "{{connections['pick-the-jrny-connection']}}"`

| Name | Display name | What | Settings |
|---|---|---|---|
| trigger | JRNY: ready for courier | `@activepieces/piece-webhook` 0.1.33 `catch_webhook` | `authType: 'hmac'`, `authFields: { hmacHeaderName: 'x-webhook-signature', hmacSecret: '', hmacAlgorithm: 'sha256', hmacEncoding: 'hex', hmacSignaturePrefix: '' }` (JRNY signs `X-Webhook-Signature` with HMAC-SHA256 hex, no prefix: `~/repo/jrny/.../webhook-delivery.processor.ts:113-136`) |
| step_4 | Sender hub | `find_hub_code_for_address` | inputs as in the spec table, plus `ifNotFound: 'unknown'` and `onFailure: 'continue'`; engine `continueOnFailure: true` |
| step_1 | Delivery hub | same | same |
| step_6 | Ready to book? | ROUTER, branch "Book it" | `BOOLEAN_IS_TRUE` on `READY` |
| step_2 | Create waybill | `create_waybill_import_header` | spec table mappings, except `accAddress1 = SENDER_ADDRESS_1` and `destAddress2 = DEST_ADDRESS_2`; `onFailure: 'continue'`; engine `continueOnFailure: true` |
| step_8 | Header created? | ROUTER, branch "Add parcels" | `BOOLEAN_IS_TRUE` `{{step_2['ok']}}` |
| step_3 | Add parcels | `create_waybill_import_dims_and_detail` | as in the spec table, plus `onFailure: 'continue'`; engine `continueOnFailure: true` |
| step_9 | Parcels added? | ROUTER, branch "Booked" | `BOOLEAN_IS_TRUE` `{{step_3['ok']}}` |
| step_10 | Booked | `courier_response` | `courierStatus: 'booked'`, `dispatchNumber`, `waybillNumber`, `hubCode: "{{step_1['output']['hubCode']}}"`, `trackingUrl: "{{step_2['output']['trackingUrl']}}"`, `courierWarning: HUB_WARNINGS`, `onFailure: 'stop'` |
| step_11 | Failed: parcels | `courier_response` (step_9 Otherwise) | `courierStatus: 'failed'`, `failedStep: 'Add parcels'`, `errorMessage: PARCELS_FAILED`, `waybillNumber`, `onFailure: 'stop'` |
| step_12 | Already in Nucleus? | ROUTER (step_8 Otherwise), branch "Booked anyway" | `TEXT_CONTAINS` `{{step_2['error']['message']}}` `already exists`, `caseSensitive: false` |
| step_13 | Booked (already in Nucleus) | `courier_response` | as step_10, but no `trackingUrl` and `courierWarning: EXISTS_WARNINGS` |
| step_14 | Failed: waybill | `courier_response` (step_12 Otherwise) | `failedStep: 'Create waybill'`, `errorMessage: HEADER_FAILED`, `onFailure: 'stop'` |
| step_7 | Failed: not booked | `courier_response` (step_6 Otherwise) | `failedStep: NOT_READY_STEP`, `errorMessage: NOT_READY_MESSAGE`, `onFailure: 'stop'` |

Every Courier Response step has `auth: JRNY`, `dispatchNumber: "{{trigger['body']['data']['dispatchNumber']}}"` and engine `continueOnFailure: false`.

The run ends **successful** after a Failed report. The fork has no stop-with-failure step without adding a Code step. The failure lives in JRNY, which is where staff look, and in the step output. Say this in the doc; it's the builder's call that the spec allowed.

**Expressions.** These are named consts in the script, each one `{{ … }}` holding a single JS expression. No `}}` may appear inside an expression, so don't use object literals. Use `?.` and fallbacks so a missing step output never throws (`evalInScope` turns a throw into `''`).
- `SENDER_ADDRESS_1`: `d.sender.address2`, or `d.sender.suburb` when blank or whitespace.
- `DEST_ADDRESS_2`: `d.deliveryAddress.line2`, or `d.deliveryAddress.suburb` when blank or whitespace.
- `READY`: `true` only when `step_4?.ok === true`, `step_1?.ok === true` and `d.courierAccountNumber` is non-blank.
- `NOT_READY_STEP`: `'Find hub code'` when either hub step isn't ok, otherwise `'Create waybill'`.
- `NOT_READY_MESSAGE`, first match wins:
  - `Find hub code: sender address: <step_4.error.message>`
  - `Find hub code: delivery address: <step_1.error.message>`
  - `Create waybill: the courier account number is missing in JRNY`

  When `error.message` is missing, use `the step failed before calling Nucleus; see this run in JRNYFLW`.
- `HUB_WARNINGS`: the sender and delivery warnings (Global Constraints wording; `<reason>` = `stepN.output.reason`) for each hub step whose `output.matchedOn === 'fallback'`, joined with `' '`. `''` when neither applies.
- `EXISTS_WARNINGS`: `Waybill already existed in Nucleus, parcels not checked.`, followed by `HUB_WARNINGS` when there are any, joined with `' '`.
- `HEADER_FAILED`: `Create waybill: <step_2.error.message, or the fallback text>`. When `step_2.error.code === 'NUCLEUS_FIELDS_TOO_LONG'`, append this fixed hint: ` Fix the address in JRNY: Sender Address 1 to 4 = warehouse address line 2 (or suburb), address line 1, suburb, city; Receiver Address 1 to 4 = delivery line 1, line 2 (or suburb), suburb, city.`
- `PARCELS_FAILED`: `Add parcels: <step_3.error.message, or the fallback text>. The waybill was created in Nucleus but its parcels were not: add them in Nucleus by hand, because a resend will mark this booked without adding them.`

- [ ] **Step 1: Write the self-check first.** At the end of the script, before writing the file, add `function evaluate({ expression, scope }: { expression: string; scope: Record<string, unknown> }): unknown`. It strips the surrounding `{{ }}` and runs `new Function(...Object.keys(scope), 'return (' + body + ')')`. Then assert these cases, pushing a line to `problems` for each mismatch:

| Case | Scope | Expected |
|---|---|---|
| blank line 2 | `d.deliveryAddress = { line2: '  ', suburb: 'Ballito' }` | `DEST_ADDRESS_2` → `'Ballito'` |
| line 2 present | `line2: 'Unit 4'` | `'Unit 4'` |
| blank sender address2 | `d.sender = { address2: null, suburb: 'Midrand' }` | `SENDER_ADDRESS_1` → `'Midrand'` |
| all good | both hubs `{ ok: true, output: { hubCode: 'JNB', matchedOn: 'suburb' } }`, account `'ACC1'` | `READY` → `true`; `HUB_WARNINGS` → `''` |
| account missing | as above, account `null` | `READY` → `false`; `NOT_READY_STEP` → `'Create waybill'`; `NOT_READY_MESSAGE` → `'Create waybill: the courier account number is missing in JRNY'` |
| delivery hub call failed | `step_1 = { ok: false, error: { message: 'Nucleus error: timeout' } }` | `NOT_READY_MESSAGE` → `'Find hub code: delivery address: Nucleus error: timeout'` |
| UNK on both + exists | both hubs `matchedOn: 'fallback'`, `reason: 'R1'` / `'R2'` | `EXISTS_WARNINGS` → `'Waybill already existed in Nucleus, parcels not checked. Sender hub not found, booked with hub UNK: R1 Delivery hub not found, booked with hub UNK: R2'` |
| header length error | `step_2 = { ok: false, error: { message: 'Too long…', code: 'NUCLEUS_FIELDS_TOO_LONG' } }` | `HEADER_FAILED` starts with `'Create waybill: Too long…'` and contains `'Fix the address in JRNY'` |
| header never ran | `step_2` undefined | `HEADER_FAILED` → `'Create waybill: the step failed before calling Nucleus; see this run in JRNYFLW'` |

Also check structure:
- every Nucleus step has `onFailure: 'continue'` and engine `continueOnFailure: true`;
- every `courier_response` step has `onFailure: 'stop'`;
- `trigger.settings.input.authFields.hmacSecret === ''`;
- the generated JSON contains none of `hmacSecret": "` followed by a non-empty value, `password` or `bearerToken`;
- every required prop of `createWaybillImportHeader` has a non-empty input in step_2;
- the prop-name check covers all steps;
- `SharedTemplate.safeParse(template)` succeeds.

- [ ] **Step 2: Run the script and see it fail**

Run: `bunx tsx scripts/uat/gen-nucleus-booking-flow.ts /tmp/claude-1000/-home-linqadmin-repo-jrnyflw/c679289d-318c-4847-b1ba-07920f6149ad/scratchpad/booking.json`
Expected: exit 1, listing problems (expressions not yet written, or written wrongly).

- [ ] **Step 3: Write the steps and expressions** until the self-check passes.

- [ ] **Step 4: Generate the real file**

Run: `bunx tsx scripts/uat/gen-nucleus-booking-flow.ts docs/integrations/nucleus/courier-booking.flow.json`
Expected: `valid, written to docs/integrations/nucleus/courier-booking.flow.json`. Then `grep -c hmacSecret docs/integrations/nucleus/courier-booking.flow.json` shows exactly one occurrence, with value `""`.

- [ ] **Step 5: Write `booking-flow.md`.** Follow `docs/integrations/shoprite/orders-flow.md` and cover:
  - the generate command;
  - an outcomes table (each case → what JRNY shows);
  - the Sender/Receiver Address 1-4 ↔ JRNY field mapping, with the sender 1/2 swap flagged as kept from the original flow;
  - import steps. **Import into the existing booking flow** (the flow's menu → Import), so the webhook URL JRNY calls stays the same. Then pick the Nucleus connection on steps 4, 1, 2 and 3 and the JRNY connection on steps 10, 11, 13, 14 and 7, and paste the **rotated** HMAC secret into the trigger;
  - why runs end successful after a Failed report;
  - the open Nucleus asks (GetWaybillinformation access; what a second parcels call does).

- [ ] **Step 6: Lint**

Run: `npm run lint-dev`
Expected: no errors in the changed files.

- [ ] **Step 7: Commit**

```bash
git add scripts/uat/gen-nucleus-booking-flow.ts docs/integrations/nucleus/courier-booking.flow.json docs/integrations/nucleus/booking-flow.md
git commit -m "feat(nucleus): courier booking flow reports every failure to JRNY, books an existing waybill or an unknown hub with a warning, and fills a blank line 2 with the suburb"
```

- [ ] **Step 8: User check on dev (manual, the user runs it).** Import into a dev JRNYFLW flow, wired to the Nucleus **test** environment and a dev JRNY. Then press resend on dev dispatches, one per case:
  - a clean booking → Booked, with no warning;
  - the same dispatch again (blocked by JRNY once booked, so instead use a waybill already staged in Nucleus test) → Booked with the "already existed" warning;
  - a delivery address line 2 over 50 characters → Failed, listing the field;
  - an unknown suburb → Booked with hub UNK and the delivery warning.

  Confirm each in JRNY's courier column. This proves the template expressions run in the real engine sandbox, which the self-check only approximates.
