# Piece call trace (Input / Sent / Output) and in-flow failure handling

Date: 2026-10-10
Pieces: `@jrnyflw/jrny`, `@jrnyflw/nucleus`, `@jrnyflw/shoprite`

## Why

When an integration misbehaves we can see a step's input and output in run history, but not the HTTP call the piece actually made. The CBR-50330000 and AON-50330110 investigations both needed a local reproduction just to learn what was sent to Nucleus.

Separately, when a step such as Find Hub Code fails, the run stops. JRNY never hears about it, so the shipping record sits in `awaiting_booking` with no explanation.

## Goals

1. Every JRNY, Nucleus and Shoprite action shows the exact calls it made (method, URL, query, headers, body, status, time), with secrets redacted.
2. A flow can carry on after one of our steps fails, read the reason, and report it to JRNY.
3. Runs where booking failed still show as failed in run history.

## Out of scope

- Custom API Call actions (they already show the request they make), Mapper and Excel.
- Engine changes. A failed step's `errorMessage` stays invisible to later steps; we work around that inside our pieces.
- Migrating any flow other than the PROD courier flow.
- JRNY-side changes. They are listed under "JRNY team" below for the user to raise.

## Part 1: what a step returns

Every in-scope action returns a wrapper instead of the raw API response:

```json
{
  "ok": true,
  "sent": [ SentCall, ... ],
  "output": <what the action returned before this change>
}
```

`SentCall`:

```json
{
  "method": "POST",
  "url": "https://fms.example/CreateWaybillImportDimsAndDetail",
  "query": { "WaybillNo": "AON-50330110", "Items": "1,1", "GroupName": "G" },
  "headers": { "Authorization": "[redacted]", "Content-Type": "application/json" },
  "body": null,
  "status": 200,
  "durationMs": 412
}
```

Rules:

- `sent` lists every HTTP call the action made, in order, including the Nucleus `POST /token` login when a fresh token was needed. A cached token means no login entry.
- **Redaction.** These values are always replaced with `"[redacted]"`: the `Authorization` header (all pieces), Shoprite's `Authentication` header, the Nucleus `password` in the token request body, and `access_token` in the token response. Connection secrets never appear anywhere in a step result. As a second guard, each action passes its connection secrets to the helper, which replaces any occurrence of them (4+ characters) in `sent` and in error messages. This matters because `HttpError` messages embed the request body, so a failed Nucleus `/token` call would otherwise put the password in the step's error. `GroupName`, `ContractID` and `UIUser` are not secrets and stay visible, since they are often what's wrong.
- **Size.** A request body over 50 KB is cut to its first 50 KB followed by `…[truncated, N KB]`. Response bodies are not copied into `sent`; the response is already `output`.
- `status` is the HTTP status, including error statuses. Network errors and timeouts reach us from `@activepieces/pieces-common` as an `HttpError` with status 500 and no response body, so they are recorded that way. `status` is `null` and `error` is set on the `SentCall` only when the call threw something other than an `HttpError`.
- **When the step stops the flow** (the default, see Part 3), the thrown error message keeps its current text and gains a final line `Sent: <JSON of sent>`, so run history shows the calls on failed steps too.

This is a breaking change for any flow that references a step's fields: `{{step_3.waybillNo}}` becomes `{{step_3.output.waybillNo}}`. Each piece goes to version 0.1.0.

## Part 2: how it's built

### Shared helper: `@jrnyflw/piece-trace`

A small workspace package at `packages/pieces/custom/trace`. It is a plain library, not a piece, so it is not listed in `AP_DEV_PIECES`. Each of the three pieces adds it as a `workspace:*` dependency, the same way they depend on `@activepieces/pieces-common`. Its build does not copy `package.json` into `dist`, so the dev-piece loader (which scans `dist/package.json` files by name) never mistakes it for a piece. Piece tests resolve it to its TypeScript source through a vitest alias, so the existing `vi.mock('@activepieces/pieces-common')` mocks also apply inside the helper.

```ts
const result = await pieceTrace.run({
    onFailure: context.propsValue.onFailure,
    secrets: nucleusClient.secretsOf(auth),
    work: async (trace) => {
        const res = await trace.send(request); // replaces httpClient.sendRequest
        return res.body;
    },
});
```

- `trace.send(request)` calls `httpClient.sendRequest`, records a redacted `SentCall`, and rethrows any error after recording it (including `HttpError` status and body).
- `pieceTrace.run({ onFailure, work })` returns `{ ok: true, sent, output }` on success. On failure it either throws the error with the `Sent:` line appended, or returns the Part 3 failure result.
- Redaction lives in the helper: a fixed list of header names (`Authorization`, `Authentication`, and any `authentication` option on the request), the secrets scrub above, plus a per-call `bodyForTrace` option the Nucleus token request uses to record its form body with the password replaced.
- The helper exports `pieceTrace.onFailureProperty()` so every action declares the Part 3 setting the same way.

**Packaging check (first task of the plan).** Confirm that a dev piece in the UAT image resolves `@jrnyflw/piece-trace` at runtime, and that the build filter `./packages/pieces/custom/*` builds `trace` before the pieces. If it can't be made to resolve cleanly, fall back to copying the helper into each piece as `src/lib/trace.ts`, with the shared tests duplicated. The design is otherwise unchanged.

### Piece changes

- **Clients.** `jrnyClient.request`/`callJrny`, `nucleusClient.call`/`getToken`, and the Shoprite `call` take a `trace` parameter and send through `trace.send`. Nucleus `throwIfResultSetError` still turns HTTP 200 error rows into failures; those count as failures for Part 3 too.
- **JRNY.** `action-factory.ts` wraps every generated action in one place. Create Quote and Courier Response are updated by hand.
- **Nucleus.** All 13 actions. Find Hub Code for Address makes up to four `GetHubCode` calls; all of them appear in `sent`, so you can see which lookups were tried.
- **Shoprite.** Download Orders, Acknowledge Orders and Upload Invoice.

### Tests

- Helper unit tests: records calls in order, records an `HttpError` status, redaction of each secret, truncation at 50 KB, `Sent:` appended to thrown errors, both `onFailure` modes.
- Per piece, a no-secrets test: run a representative action with a known password/token/API key and assert the serialized step result contains none of them.
- Existing piece tests are updated to read `result.output`.

## Part 3: failures inside the flow

### The setting

Every in-scope action gets one extra property:

> **If the call fails** — `Stop the flow` (default) · `Continue and return the error`

`Stop the flow` behaves as today, plus the `Sent:` line. `Continue and return the error` makes the step succeed with:

```json
{
  "ok": false,
  "sent": [ ... ],
  "output": null,
  "error": { "message": "No single Nucleus hub code found ... Ambiguous: Postal=7530 matches hubs WC1, CPT, WC2, WC3", "status": null }
}
```

`error.status` is the HTTP status when the failure was an HTTP error, otherwise `null`. Input validation errors (for example, both Cartons and Parcels given) are failures too and follow the same setting.

We use our own setting instead of the platform's *Continue on failure* because the engine only passes a step's `output` to later steps, and a step that fails has none, so the reason would be lost.

### PROD courier flow pattern

```
Find Hub Code            (If the call fails: Continue and return the error)
Router: {{find_hub.ok}} is false
  ├─ failed branch:
  │    JRNY Courier Response   courierStatus = Failed
  │                            errorMessage  = "Find Hub Code: {{find_hub.error.message}}"
  │    Code step               throw new Error(<same message>)
  └─ otherwise: continue to Create Waybill Import Header, and so on
```

The same check follows each later Nucleus step in the flow (for example the import header and the dims and detail). The final Code step matters: it makes the run show as failed in run history even though JRNY was told, so our own failures stay visible.

The step name in `errorMessage` is written by hand per branch, so the shipping screen says which stage failed.

### JRNY team (raised by the user, not built here)

- The dispatch stays in `awaiting_booking` when booking fails. The failure is shown on the dispatch shipping screen.
- For that, JRNY needs to accept `courierStatus: failed` on a dispatch in `awaiting_booking` without changing its status, and to store `errorMessage` (for example as a last courier error with a timestamp) so the screen can show it. Today the endpoint only accepts `ready_to_dispatch`, `dispatched` or `invoiced`, and the message is only used in the notification.
- Until JRNY ships this, the Courier Response call in the failed branch may itself be rejected. If so, it fails the run, which still leaves the run marked failed in run history, so nothing is hidden.

## Migration and rollout (PROD courier flow only)

1. The user exports the PROD courier flow JSON.
2. I rewrite every reference to an in-scope step from `{{step_N.X}}` to `{{step_N.output.X}}`, bump the step piece versions to 0.1.0, and add the Part 3 routers and failure branches. The result is reviewed before import.
3. Before deploy, take the PROD DB backup (runbook command), then deploy at a quiet time.
4. Import the rewritten flow as the draft and publish it straight away.
5. Any run that fails in the gap between deploy and publish is retried with "From failed step".

## Risks

- **Breaking references.** Any flow other than the courier flow that uses these pieces breaks until it's migrated the same way. Today only the courier flow is in use on PROD; UAT flows are migrated as they're touched.
- **Larger run records.** `sent` adds roughly the size of the request to each step. Bodies are capped at 50 KB, and the courier flow's requests are a few KB.
- **Silent green runs.** If someone builds a failed branch without the final throwing Code step, failures show as successful runs. The demo and PROD flows include it; the property description says to add it.
