# Piece Call Trace and In-Flow Failure Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every JRNY, Nucleus and Shoprite action returns `{ ok, sent, output }` showing the exact HTTP calls it made (secrets redacted), and can optionally return a failure as data so the flow can report it to JRNY.

**Architecture:** A small workspace library, `@jrnyflw/piece-trace` (`packages/pieces/custom/trace`), wraps each action's work: it hands the work a `trace` object whose `send` replaces `httpClient.sendRequest`, records each call, redacts and scrubs secrets, and shapes the result or the thrown error. The three piece clients take `trace` as a parameter; every action wraps its body in `pieceTrace.run`. A separate tool rewrites an exported flow's step references for the new output shape.

**Tech Stack:** TypeScript, Activepieces pieces-framework / pieces-common, vitest 3, Bun workspaces, turbo.

**Spec:** `docs/superpowers/specs/2026-10-10-piece-sent-trace-design.md`

## Global Constraints

- Step result shape on success: `{ ok: true, sent: SentCall[], output }`; on a continued failure: `{ ok: false, sent, output: null, error: { message, status } }`.
- `SentCall` = `{ method, url, query, headers, body, status, durationMs }` plus `error` only when the call threw something other than `HttpError`.
- Always `"[redacted]"`: `Authorization` and `Authentication` headers (any case), the request's `authentication` option, the Nucleus password in the token body. Connection secrets of 4+ characters are scrubbed from `sent` and from error messages.
- `GroupName`, `ContractID`, `UIUser` stay visible.
- Request bodies over 51,200 characters (50 KB) are cut to that length followed by `…[truncated, N KB]` (N = total size rounded up). Response bodies are not copied into `sent`.
- Stop mode: thrown message = error text + `\nSent: ` + JSON of the scrubbed `sent`. `HttpError` text is `HTTP <status>: <response body>` (never the HttpError's own message, which embeds the request body).
- New property on every in-scope action: `onFailure`, display name "If the call fails", options `stop` (default) / `continue`.
- Out of scope: Custom API Call actions, Mapper, Excel, the engine.
- Piece versions: `@jrnyflw/jrny`, `@jrnyflw/nucleus`, `@jrnyflw/shoprite` go to `0.1.0`.
- Repo rules (CLAUDE.md): no `any`, no `as` casts, single destructured object parameter for functions with more than one parameter, exported types/constants at the end of the file, util files export one grouped `const`, comments only for *why*.
- Never run anything against the JRNY ERP containers (`jrny-dev-*`, `jrny-prod-*`). Don't read `.env*` files. Push only with `CLAUDE_PUSH=yes git push`, and only when the user asks.

## Review Focus

1. **A wrong Nucleus password.** The `/token` call fails with an `HttpError` whose message embeds the form body (`password=...`). The step's error and `sent` must not contain the password, plain or URL-encoded. Test: Task 2, "a failed login never shows the password".
2. **A large POD image upload.** `Upload POD Image` sends a base64 file in the body. `sent` must hold a truncated body, not the whole file. Test: Task 2, "a large POD image is truncated in sent".
3. **A validation error in continue mode before any HTTP call** (e.g. Get Hub Code with no filters). The step must return `ok: false`, `sent: []`, `status: null`, not throw. Test: Task 2, "continue mode returns validation errors as data".
4. **A Nucleus HTTP 200 error row in continue mode.** The step must return `ok: false` with `Nucleus error: ...` and `status: null`, and `sent` must show the 200. Test: Task 2, "continue mode returns a Nucleus error row as data".
5. **Running the flow migration twice, or a flow with both `step_1` and `step_10`.** References must not become `.output.output`, and `step_1` must not touch `step_10`. Test: Task 5, "is idempotent" and "does not confuse step_1 with step_10".

---

## File Structure

**Create**
- `packages/pieces/custom/trace/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json`, `vitest.config.ts` — the library package.
- `packages/pieces/custom/trace/src/index.ts` — public exports.
- `packages/pieces/custom/trace/src/lib/trace.ts` — `pieceTrace` (`run`, `onFailureProperty`, `redacted`) and the types.
- `packages/pieces/custom/trace/test/trace.test.ts` — helper tests.
- `packages/pieces/custom/trace/tools/migrate-flow.ts` — pure flow-reference migration (`flowMigration.migrate`).
- `packages/pieces/custom/trace/tools/migrate-flow-cli.ts` — CLI wrapper.
- `packages/pieces/custom/trace/test/migrate-flow.test.ts` — migration tests.
- `packages/pieces/custom/nucleus/test/trace.test.ts`, `packages/pieces/custom/jrny/test/trace.test.ts`, `packages/pieces/custom/shoprite/test/trace.test.ts` — per-piece trace and no-secrets tests.
- `packages/pieces/custom/jrny/vitest.config.ts` — jrny has none yet; needed for the alias.

**Modify**
- `tsconfig.base.json` — path alias for the new package (editor/LSP).
- `bun.lock` — via `bun install`.
- Nucleus: `src/lib/client.ts`, all 13 non-custom actions in `src/lib/actions/`, `vitest.config.ts`, `package.json`, `test/get-pod-bulk.test.ts`, `test/tracking-pod.test.ts`.
- JRNY: `src/lib/client.ts`, `src/lib/action-factory.ts`, `src/lib/actions/create-quote.ts`, `src/lib/actions/courier-response.ts`, `package.json`, `test/action-factory.test.ts`, `test/courier-response.test.ts`.
- Shoprite: `src/lib/client.ts`, `src/lib/actions/{download-orders,acknowledge-orders,upload-invoice}.ts`, `vitest.config.ts`, `package.json`, `test/download-orders.test.ts`.
- `scripts/uat/DEPLOY-RUNBOOK.md` — migration section.

---

### Task 1: `@jrnyflw/piece-trace` helper

**Files:**
- Create: `packages/pieces/custom/trace/{package.json,tsconfig.json,tsconfig.lib.json,.eslintrc.json,vitest.config.ts}`
- Create: `packages/pieces/custom/trace/src/index.ts`, `packages/pieces/custom/trace/src/lib/trace.ts`
- Test: `packages/pieces/custom/trace/test/trace.test.ts`
- Modify: `tsconfig.base.json` (paths block, next to `@jrnyflw/excel`), `bun.lock`

**Interfaces:**
- Consumes: `httpClient`, `HttpError`, `HttpRequest`, `HttpResponse` from `@activepieces/pieces-common`; `Property` from `@activepieces/pieces-framework`.
- Produces:
  - `pieceTrace.run<T>({ onFailure: unknown; secrets: string[]; work: (trace: Tracer) => Promise<T> }): Promise<TraceResult<T>>` — anything other than `onFailure === 'continue'` stops.
  - `Tracer = { send<R>(params: { request: HttpRequest; bodyForTrace?: unknown }): Promise<HttpResponse<R>> }`
  - `pieceTrace.onFailureProperty()` — `Property.StaticDropdown<OnFailure>`, `required: false`, `defaultValue: 'stop'`.
  - `pieceTrace.redacted` — the string `'[redacted]'`.
  - Types `OnFailure = 'stop' | 'continue'`, `SentCall`, `TraceError = { message: string; status: number | null }`, `TraceResult<T>`.

- [ ] **Step 1: Scaffold the package**

`packages/pieces/custom/trace/package.json` (no `cp package.json dist/`: the dev-piece loader scans `dist/package.json` files, and this is not a piece):

```json
{
  "name": "@jrnyflw/piece-trace",
  "version": "0.1.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.lib.json",
    "lint": "eslint 'src/**/*.ts'",
    "test": "vitest run"
  },
  "dependencies": {
    "@activepieces/pieces-common": "workspace:*",
    "@activepieces/pieces-framework": "workspace:*",
    "tslib": "2.6.2"
  },
  "devDependencies": {
    "vitest": "3.0.8"
  }
}
```

Copy these three files unchanged from `packages/pieces/custom/nucleus/`: `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json`.

`packages/pieces/custom/trace/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

In `tsconfig.base.json`, add after the `"@jrnyflw/excel"` entry:

```json
      "@jrnyflw/piece-trace": [
        "packages/pieces/custom/trace/src/index.ts"
      ],
```

Run: `cd /home/linqadmin/repo/jrnyflw && bun install`
Expected: completes; `ls packages/pieces/custom/trace/node_modules/@activepieces` shows `pieces-common` and `pieces-framework`; `git diff --stat bun.lock` is a small change.

- [ ] **Step 2: Write the failing tests**

`packages/pieces/custom/trace/test/trace.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { AuthenticationType, HttpError, HttpMethod } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { pieceTrace } from '../src';

function httpError({ status, data, requestBody }: { status: number; data: unknown; requestBody: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
        status, statusText: '', headers: {}, config, data,
    });
    return new HttpError(requestBody, axiosError);
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
    throw new Error('expected the promise to reject');
}

describe('pieceTrace.run', () => {
    beforeEach(() => sendRequest.mockReset());

    test('records every call in order and wraps the output', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { id: 1 } });
        sendRequest.mockResolvedValueOnce({ status: 201, body: { id: 2 } });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', queryParams: { q: '1' } } });
                const second = await trace.send<{ id: number }>({
                    request: { method: HttpMethod.POST, url: 'https://api/b', headers: { 'Content-Type': 'application/json' }, body: { name: 'x' } },
                });
                return second.body;
            },
        });
        expect(result).toEqual({
            ok: true,
            output: { id: 2 },
            sent: [
                { method: 'GET', url: 'https://api/a', query: { q: '1' }, headers: {}, body: null, status: 200, durationMs: expect.any(Number) },
                { method: 'POST', url: 'https://api/b', query: {}, headers: { 'Content-Type': 'application/json' }, body: { name: 'x' }, status: 201, durationMs: expect.any(Number) },
            ],
        });
    });

    test('redacts auth headers whatever their case, and the authentication option', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', headers: { authorization: 'Basic abc', Authentication: 'abc', ContractID: 'C1', UIUser: 'u1' } } });
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/b', authentication: { type: AuthenticationType.BEARER_TOKEN, token: 'tok' } } });
            },
        });
        expect(result.sent[0].headers).toEqual({ authorization: '[redacted]', Authentication: '[redacted]', ContractID: 'C1', UIUser: 'u1' });
        expect(result.sent[1].headers).toEqual({ Authorization: '[redacted]' });
    });

    test('records bodyForTrace instead of the real body', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/token', body: 'password=abc' }, bodyForTrace: 'password=[redacted]' }),
        });
        expect(result.sent[0].body).toBe('password=[redacted]');
        expect(sendRequest.mock.calls[0][0].body).toBe('password=abc');
    });

    test('truncates bodies over 50 KB and leaves smaller ones alone', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a', body: { image: 'a'.repeat(60 * 1024) } } });
                await trace.send({ request: { method: HttpMethod.POST, url: 'https://api/b', body: 'small' } });
            },
        });
        const truncated = String(result.sent[0].body);
        expect(truncated.length).toBeLessThan(52 * 1024);
        expect(truncated).toMatch(/…\[truncated, 61 KB\]$/);
        expect(result.sent[1].body).toBe('small');
    });

    test('scrubs connection secrets from sent and from the error, ignoring secrets under 4 characters', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: ['hunter22', 'ab', ''],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a?key=hunter22', queryParams: { k: 'hunter22' }, body: { nested: ['x hunter22 y'] } } });
                throw new Error('bad key hunter22 for ab');
            },
        });
        expect(result).toMatchObject({
            ok: false,
            output: null,
            error: { message: 'bad key [redacted] for ab', status: null },
            sent: [{ url: 'https://api/a?key=[redacted]', query: { k: '[redacted]' }, body: { nested: ['x [redacted] y'] }, status: 200 }],
        });
        expect(JSON.stringify(result)).not.toContain('hunter22');
    });

    test('stop: throws the HTTP status and response body plus what was sent, never the HttpError request body', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 409, data: { error: 'Conflict' }, requestBody: 'password=topsecret' }));
        const message = await failureOf(pieceTrace.run({
            onFailure: 'stop',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a', body: 'password=topsecret' }, bodyForTrace: 'password=[redacted]' }),
        }));
        expect(message).toMatch(/^HTTP 409: \{"error":"Conflict"\}\nSent: \[/);
        expect(message).toContain('"status":409');
        expect(message).not.toContain('topsecret');
    });

    test('continue: returns an HTTP failure as data with its status', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 409, data: { error: 'Conflict' }, requestBody: {} }));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a' } }),
        });
        expect(result).toEqual({
            ok: false,
            output: null,
            error: { message: 'HTTP 409: {"error":"Conflict"}', status: 409 },
            sent: [expect.objectContaining({ url: 'https://api/a', status: 409 })],
        });
    });

    test('describes an HttpError with no response body', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 500, data: undefined, requestBody: {} }));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a' } }),
        });
        expect(result).toMatchObject({ ok: false, error: { message: 'HTTP 500 with no response body', status: 500 } });
    });

    test('records a non-HTTP send failure on the call itself', async () => {
        sendRequest.mockRejectedValueOnce(new Error('socket hang up'));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a' } }),
        });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'socket hang up', status: null },
            sent: [{ url: 'https://api/a', status: null, error: 'socket hang up' }],
        });
    });

    test('continue: a failure before any call returns an empty sent list', async () => {
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: async () => {
                throw new Error('Provide a waybill');
            },
        });
        expect(result).toEqual({ ok: false, sent: [], output: null, error: { message: 'Provide a waybill', status: null } });
    });
});

describe('pieceTrace.onFailureProperty', () => {
    test('defaults to stopping the flow', () => {
        const prop = pieceTrace.onFailureProperty();
        expect(prop.defaultValue).toBe('stop');
        expect(prop.options.options.map((o) => o.value)).toEqual(['stop', 'continue']);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/trace && npx vitest run`
Expected: FAIL, cannot resolve `../src`.

- [ ] **Step 4: Implement the helper**

`packages/pieces/custom/trace/src/lib/trace.ts`:

```ts
import { HttpError, HttpRequest, HttpResponse, httpClient } from '@activepieces/pieces-common';
import { Property } from '@activepieces/pieces-framework';

async function run<T>({ onFailure, secrets, work }: RunParams<T>): Promise<TraceResult<T>> {
    const sent: SentCall[] = [];
    const tracer: Tracer = {
        send: <R>(params: SendParams) => sendAndRecord<R>({ ...params, sent }),
    };
    const usableSecrets = secrets.filter((secret) => secret.length >= MIN_SECRET_LENGTH);
    try {
        const output = await work(tracer);
        return { ok: true, sent: scrubSent({ sent, secrets: usableSecrets }), output };
    } catch (err) {
        const cleanSent = scrubSent({ sent, secrets: usableSecrets });
        const message = scrubText({ text: describeError(err), secrets: usableSecrets });
        if (onFailure === 'continue') {
            return { ok: false, sent: cleanSent, output: null, error: { message, status: httpFailureStatus(cleanSent) } };
        }
        throw new Error(`${message}\nSent: ${JSON.stringify(cleanSent)}`);
    }
}

function onFailureProperty() {
    return Property.StaticDropdown<OnFailure>({
        displayName: 'If the call fails',
        description:
            'Continue makes this step succeed with { ok: false, error } so a Router can handle the failure. If you continue, end the failure branch with a step that fails the run, or the run will show as successful.',
        required: false,
        defaultValue: 'stop',
        options: {
            options: [
                { label: 'Stop the flow', value: 'stop' },
                { label: 'Continue and return the error', value: 'continue' },
            ],
        },
    });
}

async function sendAndRecord<R>({ request, bodyForTrace, sent }: SendParams & { sent: SentCall[] }): Promise<HttpResponse<R>> {
    const startedAt = Date.now();
    const call: SentCall = {
        method: request.method,
        url: request.url,
        query: { ...(request.queryParams ?? {}) },
        headers: traceHeaders(request),
        body: traceBody(bodyForTrace === undefined ? request.body : bodyForTrace),
        status: null,
        durationMs: 0,
    };
    sent.push(call);
    try {
        const response = await httpClient.sendRequest<R>(request);
        call.status = response.status ?? null;
        return response;
    } catch (err) {
        if (err instanceof HttpError) {
            call.status = err.response.status;
        } else {
            call.error = describeError(err);
        }
        throw err;
    } finally {
        call.durationMs = Date.now() - startedAt;
    }
}

function traceHeaders(request: HttpRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
        if (value === undefined) {
            continue;
        }
        headers[name] = REDACTED_HEADERS.includes(name.toLowerCase()) ? REDACTED : [value].flat().join(', ');
    }
    if (request.authentication !== undefined) {
        headers['Authorization'] = REDACTED;
    }
    return headers;
}

function traceBody(body: unknown): unknown {
    if (body === undefined) {
        return null;
    }
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    if (text === undefined || text.length <= MAX_BODY_CHARS) {
        return body;
    }
    return `${text.slice(0, MAX_BODY_CHARS)}…[truncated, ${Math.ceil(text.length / 1024)} KB]`;
}

// HttpError's own message embeds the request body, which for a login holds the password.
function describeError(err: unknown): string {
    if (err instanceof HttpError) {
        const { status, body } = err.response;
        if (body === undefined || body === null || body === '') {
            return `HTTP ${status} with no response body`;
        }
        return `HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
    }
    return err instanceof Error ? err.message : String(err);
}

function httpFailureStatus(sent: SentCall[]): number | null {
    const last = sent[sent.length - 1];
    return last !== undefined && last.status !== null && last.status >= 400 ? last.status : null;
}

function scrubSent({ sent, secrets }: { sent: SentCall[]; secrets: string[] }): SentCall[] {
    return sent.map((call) => ({
        ...call,
        url: scrubText({ text: call.url, secrets }),
        query: scrubRecord({ record: call.query, secrets }),
        headers: scrubRecord({ record: call.headers, secrets }),
        body: scrubValue({ value: call.body, secrets }),
        ...(call.error === undefined ? {} : { error: scrubText({ text: call.error, secrets }) }),
    }));
}

function scrubRecord({ record, secrets }: { record: Record<string, string>; secrets: string[] }): Record<string, string> {
    return Object.fromEntries(Object.entries(record).map(([key, value]): [string, string] => [key, scrubText({ text: value, secrets })]));
}

function scrubValue({ value, secrets }: { value: unknown; secrets: string[] }): unknown {
    if (typeof value === 'string') {
        return scrubText({ text: value, secrets });
    }
    if (Array.isArray(value)) {
        return value.map((item) => scrubValue({ value: item, secrets }));
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, item]): [string, unknown] => [key, scrubValue({ value: item, secrets })]));
    }
    return value;
}

function scrubText({ text, secrets }: { text: string; secrets: string[] }): string {
    return secrets.reduce((acc, secret) => acc.split(secret).join(REDACTED), text);
}

const REDACTED = '[redacted]';
const REDACTED_HEADERS = ['authorization', 'authentication'];
const MAX_BODY_CHARS = 50 * 1024;
// Shorter values would scrub ordinary text such as single letters out of URLs and messages.
const MIN_SECRET_LENGTH = 4;

export const pieceTrace = { run, onFailureProperty, redacted: REDACTED };

type SendParams = { request: HttpRequest; bodyForTrace?: unknown };
type RunParams<T> = { onFailure: unknown; secrets: string[]; work: (trace: Tracer) => Promise<T> };

export type OnFailure = 'stop' | 'continue';
export type Tracer = { send: <R>(params: SendParams) => Promise<HttpResponse<R>> };
export type SentCall = {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
    status: number | null;
    durationMs: number;
    error?: string;
};
export type TraceError = { message: string; status: number | null };
export type TraceResult<T> =
    | { ok: true; sent: SentCall[]; output: T }
    | { ok: false; sent: SentCall[]; output: null; error: TraceError };
```

`packages/pieces/custom/trace/src/index.ts`:

```ts
export { pieceTrace } from './lib/trace';
export type { OnFailure, SentCall, TraceError, TraceResult, Tracer } from './lib/trace';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/trace && npx vitest run`
Expected: PASS, 11 tests.

- [ ] **Step 6: Build and lint**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/trace && bun run build && npx eslint 'src/**/*.ts'`
Expected: `dist/src/index.js` and `dist/src/index.d.ts` exist, no `dist/package.json`; eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
cd /home/linqadmin/repo/jrnyflw
git add packages/pieces/custom/trace tsconfig.base.json bun.lock
git commit -m "feat(trace): add piece call trace helper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nucleus actions return the trace (and packaging check)

**Files:**
- Modify: `packages/pieces/custom/nucleus/package.json`, `packages/pieces/custom/nucleus/vitest.config.ts`
- Modify: `packages/pieces/custom/nucleus/src/lib/client.ts`
- Modify: all 13 files in `packages/pieces/custom/nucleus/src/lib/actions/` except `custom-api-call.ts`
- Modify: `packages/pieces/custom/nucleus/test/get-pod-bulk.test.ts:25`, `packages/pieces/custom/nucleus/test/tracking-pod.test.ts:38`
- Test: `packages/pieces/custom/nucleus/test/trace.test.ts`

**Interfaces:**
- Consumes: `pieceTrace`, `Tracer` from Task 1.
- Produces:
  - `nucleusClient.call<T>({ trace, auth, store, method, path, query?, body? }): Promise<T>`
  - `nucleusClient.getToken({ auth, store, trace }): Promise<string>`
  - `nucleusClient.secretsOf(auth: NucleusAuth): string[]` → `[auth.password, encodeURIComponent(auth.password)]`
  - Every Nucleus action except Custom API Call has an `onFailure` prop and returns `TraceResult`.

- [ ] **Step 1: Wire the dependency and the test alias**

In `packages/pieces/custom/nucleus/package.json`: set `"version": "0.1.0"` and add to `dependencies`: `"@jrnyflw/piece-trace": "workspace:*",`.

Replace `packages/pieces/custom/nucleus/vitest.config.ts` (the alias points tests at the helper's source, so the existing `vi.mock('@activepieces/pieces-common')` also applies inside it):

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@jrnyflw/piece-trace': fileURLToPath(new URL('../trace/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
```

Run: `cd /home/linqadmin/repo/jrnyflw && bun install`
Expected: `ls -la packages/pieces/custom/nucleus/node_modules/@jrnyflw/` shows `piece-trace -> ../../../trace` (or equivalent symlink).

- [ ] **Step 2: Write the failing tests**

`packages/pieces/custom/nucleus/test/trace.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { ApFile, createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { getTracking } from '../src/lib/actions/get-tracking';
import { getHubCode } from '../src/lib/actions/get-hub-code';
import { findHubCodeForAddress } from '../src/lib/actions/find-hub-code-for-address';
import { createPodImage } from '../src/lib/actions/create-pod-image';

const PASSWORD = 'S3cret&pw';
const auth = { props: { baseUrl: 'https://api/', username: 'apiuser', password: PASSWORD, groupName: 'G' } };
const TOKEN_RESPONSE = { status: 200, body: { access_token: 'TOKEN-123456', expires_in: 3599 } };

function httpError({ status, data, requestBody }: { status: number; data: unknown; requestBody: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError(requestBody, new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
        status, statusText: '', headers: {}, config, data,
    }));
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
    throw new Error('expected the promise to reject');
}

function expectNoSecrets(text: string): void {
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(encodeURIComponent(PASSWORD));
    expect(text).not.toContain('TOKEN-123456');
}

describe('nucleus trace', () => {
    beforeEach(() => sendRequest.mockReset());

    test('records the login with the password redacted, hides the bearer token and keeps GroupName', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[]] } });
        const result = await getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth });
        expect(result.ok).toBe(true);
        expect(result.output).toEqual({ ResultSets: [[]] });
        expect(result.sent.map((c) => c.url)).toEqual(['https://api/token', 'https://api/GetTracking']);
        expect(result.sent[0].body).toBe('username=apiuser&password=[redacted]&grant_type=password');
        expect(result.sent[1].headers).toEqual({ Authorization: '[redacted]' });
        expect(result.sent[1].query).toEqual({ Waybill: 'W1', GroupName: 'G' });
        expectNoSecrets(JSON.stringify(result));
    });

    test('a failed login never shows the password', async () => {
        sendRequest.mockRejectedValueOnce(httpError({
            status: 400,
            data: { error: 'invalid_grant' },
            requestBody: `username=apiuser&password=${encodeURIComponent(PASSWORD)}&grant_type=password`,
        }));
        const message = await failureOf(getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth }));
        expect(message).toContain('HTTP 400: {"error":"invalid_grant"}');
        expectNoSecrets(message);
    });

    test('a large POD image is truncated in sent', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ SucessMessage: 'Image Saved Successfully!' }]] } });
        const file = new ApFile('pod.png', Buffer.alloc(80 * 1024, 1), 'png');
        const propsValue = { waybill: 'W1', source: 'file', file, imageFormat: 'PNG' };
        const result = await createPodImage.run({ ...createMockActionContext({ propsValue }), auth });
        const recorded = String(result.sent[1].body);
        expect(recorded).toMatch(/…\[truncated, \d+ KB\]$/);
        expect(recorded.length).toBeLessThan(52 * 1024);
        expect(sendRequest.mock.calls[1][0].body.Image.length).toBeGreaterThan(100 * 1024);
    });

    test('continue mode returns validation errors as data', async () => {
        const result = await getHubCode.run({ ...createMockActionContext({ propsValue: { onFailure: 'continue' } }), auth });
        expect(result).toEqual({
            ok: false,
            sent: [],
            output: null,
            error: { message: 'Provide at least one of Postal Code, Suburb, City or Province', status: null },
        });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('continue mode returns a Nucleus error row as data', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'WAYBILL DOES NOT EXIST' }]] } });
        const result = await getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1', onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({ ok: false, output: null, error: { message: 'Nucleus error: WAYBILL DOES NOT EXIST', status: null } });
        expect(result.sent[1].status).toBe(200);
    });

    test('stop mode appends what was sent to the error', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'WAYBILL DOES NOT EXIST' }]] } });
        const message = await failureOf(getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth }));
        expect(message).toMatch(/^Nucleus error: WAYBILL DOES NOT EXIST\nSent: \[/);
        expect(message).toContain('https://api/GetTracking');
        expectNoSecrets(message);
    });

    test('Find Hub Code records every lookup it tried', async () => {
        const row = { HubCode: 'CPT', Suburb: 'BELLVILLE', City: 'CAPE TOWN', Province: 'Western Cape', PostalCode: '7530' };
        sendRequest.mockImplementation(async (req: { url: string; queryParams: Record<string, string> }) => {
            if (req.url.endsWith('/token')) {
                return TOKEN_RESPONSE;
            }
            return { status: 200, body: { ResultSets: [req.queryParams['Postal'] ? [] : [row]] } };
        });
        const result = await findHubCodeForAddress.run({ ...createMockActionContext({ propsValue: { suburb: 'Bellville', postalCode: '7530' } }), auth });
        expect(result.output).toEqual(expect.objectContaining({ hubCode: 'CPT', matchedOn: 'suburb' }));
        expect(result.sent.filter((c) => c.url.endsWith('/GetHubCode')).map((c) => c.query)).toEqual([
            { Suburb: 'Bellville', Postal: '7530', GroupName: 'G' },
            { Suburb: 'Bellville', GroupName: 'G' },
        ]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/nucleus && npx vitest run test/trace.test.ts`
Expected: FAIL, e.g. `result.sent` is undefined / `result.ok` is undefined.

- [ ] **Step 4: Thread `trace` through the Nucleus client**

In `packages/pieces/custom/nucleus/src/lib/client.ts`:

Add the import:

```ts
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
```

and change `import { HttpMethod, QueryParams, httpClient } from '@activepieces/pieces-common';` to `import { HttpMethod, QueryParams } from '@activepieces/pieces-common';`.

Replace `fetchToken`, `getToken` and `call` with:

```ts
async function fetchToken({ auth, trace }: { auth: NucleusAuth; trace: Tracer }): Promise<CachedToken> {
    const response = await trace.send<{ access_token: string; expires_in: number }>({
        request: {
            method: HttpMethod.POST,
            url: joinUrl(auth.baseUrl, '/token'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenForm({ username: auth.username, encodedPassword: encodeURIComponent(auth.password) }),
        },
        bodyForTrace: tokenForm({ username: auth.username, encodedPassword: pieceTrace.redacted }),
    });
    const expiresInMs = (response.body.expires_in ?? 3599) * 1000;
    return { token: response.body.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
}

function tokenForm({ username, encodedPassword }: { username: string; encodedPassword: string }): string {
    return `username=${encodeURIComponent(username)}&password=${encodedPassword}&grant_type=password`;
}

type StoreLike = { get: (k: string) => Promise<unknown>; put: <T>(k: string, v: T) => Promise<T> };

async function getToken({ auth, store, trace }: { auth: NucleusAuth; store: StoreLike; trace: Tracer }): Promise<string> {
    const cached = await store.get(TOKEN_STORE_KEY);
    if (isCachedToken(cached) && !isExpired(cached, Date.now())) {
        return cached.token;
    }
    const fresh = await fetchToken({ auth, trace });
    await store.put(TOKEN_STORE_KEY, fresh);
    return fresh.token;
}

async function call<T>(params: {
    trace: Tracer;
    auth: NucleusAuth;
    store: StoreLike;
    method: HttpMethod;
    path: string;
    query?: QueryParams;
    body?: unknown;
}): Promise<T> {
    const token = await getToken({ auth: params.auth, store: params.store, trace: params.trace });
    const response = await params.trace.send<T>({
        request: {
            method: params.method,
            url: joinUrl(params.auth.baseUrl, params.path),
            headers: { Authorization: `Bearer ${token}` },
            queryParams: { ...(params.query ?? {}), GroupName: params.auth.groupName },
            body: params.body,
        },
    });
    throwIfResultSetError(response.body);
    return response.body;
}

// Nucleus form-encodes the password, so both spellings must be scrubbed.
function secretsOf(auth: NucleusAuth): string[] {
    return [auth.password, encodeURIComponent(auth.password)];
}
```

Change the export line to:

```ts
export const nucleusClient = { joinUrl, isExpired, getToken, call, throwIfResultSetError, secretsOf };
```

(`isExpired(cached, nowMs)` keeps its two positional parameters: it is unchanged and outside this task.)

- [ ] **Step 5: Wrap every Nucleus action**

Each file gets `import { pieceTrace } from '@jrnyflw/piece-trace';`, a new last prop `onFailure: pieceTrace.onFailureProperty(),`, and the `run` below. Validation stays inside `work` so it follows the same setting.

`get-tracking.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetTracking', query: { Waybill: context.propsValue.waybill } }),
        });
    },
```

`get-tracking-by-accnum.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.GET,
                    path: 'GetTrackingByAccnum',
                    query: { Accnum: p.accnum, DateFrom: p.dateFrom, DateTo: p.dateTo },
                }),
        });
    },
```

`get-pod-bulk.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.GET,
                    path: 'GetPODInformation_Bulk',
                    query: { waybillnumbers: context.propsValue.waybillNumbers },
                }),
        });
    },
```

`get-pod-bulk-extra.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.GET,
                    path: 'GetPODInformation_Bulk_Extra',
                    query: { waybillnumbers: context.propsValue.waybillNumbers },
                }),
        });
    },
```

`get-label.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const query: Record<string, string> = { Waybill: context.propsValue.waybill };
                if (context.propsValue.parcel) query['Parcel'] = context.propsValue.parcel;
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetLabel', query });
            },
        });
    },
```

`get-hub-code.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const query: Record<string, string> = {
                    ...spread('Postal', p.postal),
                    ...spread('Suburb', p.suburb),
                    ...spread('City', p.city),
                    ...spread('Province', p.province),
                };
                if (Object.keys(query).length === 0) {
                    throw new Error('Provide at least one of Postal Code, Suburb, City or Province');
                }
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetHubCode', query });
            },
        });
    },
```

Every `work` with a block body is written `async` for consistency; `pieceTrace.run` catches both synchronous throws and rejections, so validation errors follow the `onFailure` setting either way.

`find-hub-code-for-address.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        const { onFailure, ...address } = context.propsValue;
        return pieceTrace.run({
            onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) =>
                nucleusHubCodes.resolveHubCode({
                    address,
                    lookup: async (query) =>
                        nucleusHubCodes.parseHubRows(
                            await nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetHubCode', query }),
                        ),
                }),
        });
    },
```

`create-tracking.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.POST,
                    path: 'createtrack',
                    query: { Waybill: p.waybill, DateStamp: p.dateStamp, EventCode: p.eventCode, ActionTaken: p.actionTaken, Person: p.person },
                }),
        });
    },
```

`create-verbal-pod.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.POST,
                    path: 'createpod',
                    query: { Waybill: p.waybill, Podcom1: p.signedBy, Poddate: p.podDate, Podcom2: p.podTime },
                }),
        });
    },
```

`create-pod-image.ts`:

```ts
    async run(context) {
        const p = context.propsValue;
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const image = resolveImage({ source: p.source, fileBase64: p.file?.base64, signedUrl: p.signedUrl });
                return nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.POST,
                    path: 'createpodbase64',
                    body: { Waybill: p.waybill, Image: image.value, StringType: image.stringType, ImageFormat: p.imageFormat, GroupName: auth.groupName },
                });
            },
        });
    },
```

`create-waybill.ts` (keep `spread` and everything above `run`; the existing `as Array<...>` cast on `p.parcels` is pre-existing and stays, to keep this change focused):

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const parcels = (p.parcels ?? []) as Array<{ parcelNo: string; items: number; length: number; width: number; height: number; weight: number }>;
                const packed = nucleusParcels.packParcels(parcels);
                const query: Record<string, string> = {
                    WAYBILL: p.waybill,
                    DATEWAY: p.dateWay,
                    BRANCH: p.branch,
                    ACCNUM: p.accNum,
                    SERV_C: p.servC,
                    CUSTNAME: p.custName,
                    SHIPNAME: p.shipName,
                    CONSIGNAME: p.consigName,
                    ...packed,
                    ...spread('SHIPTELNO', p.shipTel),
                    ...spread('SHIPADRES1', p.shipAddr1),
                    ...spread('SHIPADRES2', p.shipAddr2),
                    ...spread('SHIPADRES3', p.shipAddr3),
                    ...spread('SHIPADRES4', p.shipAddr4),
                    ...spread('SENDAREA', p.sendArea),
                    ...spread('CONNAME', p.conName),
                    ...spread('CONTELNO', p.conTel),
                    ...spread('CONADDR1', p.conAddr1),
                    ...spread('CONADDR2', p.conAddr2),
                    ...spread('CONADDR3', p.conAddr3),
                    ...spread('CONADDR4', p.conAddr4),
                    ...spread('DESTAREA', p.destArea),
                    ...spread('REFNUM', p.reference),
                    ...spread('MASSKG', p.massKg),
                };
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.POST, path: 'CreateWaybill_Inhouse', query });
            },
        });
    },
```

`create-waybill-import-header.ts` (helpers `toNucleusDecimal`, `toNucleusDate`, `always` unchanged):

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const query: Record<string, string> = {
                    WaybillNo: p.waybillNo,
                    WaybillNoDate: toNucleusDate(p.waybillDate),
                    Serv_Code: p.servCode,
                    NoParcels: String(p.noParcels),
                    Weight: toNucleusDecimal(p.weight),
                    AccName: p.accName,
                    Acc_TelNo: p.accTelNo,
                    AccNum: p.accNum,
                    Orig_Code: p.origCode,
                    Acc_Address01: p.accAddress1,
                    Acc_Address02: p.accAddress2,
                    Acc_Address03: p.accAddress3,
                    Acc_Address04: p.accAddress4,
                    Acc_PostalCode: p.accPostalCode,
                    Dest_Name: p.destName,
                    Contact_Name: p.contactName,
                    Contact_TelNo: p.contactTelNo,
                    Dest_Code: p.destCode,
                    Dest_Address01: p.destAddress1,
                    Dest_Address02: p.destAddress2,
                    Dest_Address03: p.destAddress3,
                    Dest_Address04: p.destAddress4,
                    Dest_PostalCode: p.destPostalCode,
                    ...always('Dest_AccNum', p.destAccNum),
                    ...always('CustomerPONumber', p.customerPONumber),
                    ...always('Reference', p.reference),
                    ...always('Instruct', p.instruct),
                    ...always('Cost_Centre', p.costCentre),
                    ...always('Route_Code', p.routeCode),
                    ...always('Carrier', p.carrier),
                    ...always('AccNum2', p.accNum2),
                    ...always('Filename', p.filename),
                };
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.POST, path: 'CreateWaybillImportHeader', query });
            },
        });
    },
```

`create-waybill-import-dims-and-detail.ts` (helpers unchanged):

```ts
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const parcels = resolveParcels({ cartonsJson: p.cartonsJson, itemsField: p.itemsField, parcels: p.parcels });
                const query: Record<string, string> = {
                    WaybillNo: p.waybillNo,
                    ...nucleusParcels.packImportParcels(parcels),
                    ItemCode: p.itemCode ?? '',
                    FileName: '',
                    Status: '',
                };
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.POST, path: 'CreateWaybillImportDimsAndDetail', query });
            },
        });
    },
```

- [ ] **Step 6: Update the two existing tests that read the raw result**

`test/get-pod-bulk.test.ts` line 25: `expect(result).toEqual([...])` → `expect(result.output).toEqual([{ Waybill: 'W1', POD: 'signed' }]);`
`test/tracking-pod.test.ts` line 38: `expect(result).toEqual(...)` → `expect(result.output).toEqual({ ResultSets: [[{ HubCode: 'CPT', Suburb: 'AIRLIE' }]] });`

- [ ] **Step 7: Run the whole Nucleus suite**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/nucleus && npx vitest run`
Expected: PASS, 45 tests (38 existing + 7 new). The existing `rejects.toThrow('not both')`, `'at least one'` and `'File is required'` tests still pass because the stop-mode message starts with the original text.

- [ ] **Step 8: Packaging check (runtime resolution and build order)**

Run:

```bash
cd /home/linqadmin/repo/jrnyflw
npx turbo run build --filter=@jrnyflw/nucleus 2>&1 | grep -E "piece-trace:build|nucleus:build" | head
node -e "const p = require('./packages/pieces/custom/nucleus/dist/src/index.js'); console.log(typeof p.nucleus)"
ls packages/pieces/custom/trace/dist/package.json 2>&1
```

Expected: turbo shows `@jrnyflw/piece-trace:build` running before `@jrnyflw/nucleus:build`; node prints `object`; the `ls` reports "No such file or directory".
If node cannot resolve `@jrnyflw/piece-trace`, stop and use the spec's fallback (copy `trace.ts` into each piece as `src/lib/trace.ts`), and tell the user before going on.

- [ ] **Step 9: Lint and commit**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/nucleus && npx eslint 'src/**/*.ts'`
Expected: no output.

```bash
cd /home/linqadmin/repo/jrnyflw
git add packages/pieces/custom/nucleus bun.lock
git commit -m "feat(nucleus): return the calls each action sent and optional failure data

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: JRNY actions return the trace

**Files:**
- Create: `packages/pieces/custom/jrny/vitest.config.ts`
- Modify: `packages/pieces/custom/jrny/package.json`
- Modify: `packages/pieces/custom/jrny/src/lib/client.ts`, `src/lib/action-factory.ts`, `src/lib/actions/create-quote.ts`, `src/lib/actions/courier-response.ts`
- Modify: `packages/pieces/custom/jrny/test/action-factory.test.ts`, `test/courier-response.test.ts`
- Test: `packages/pieces/custom/jrny/test/trace.test.ts`

**Interfaces:**
- Consumes: `pieceTrace`, `Tracer` from Task 1.
- Produces:
  - `jrnyClient.request<T>({ trace, auth, method, path, query?, body? }): Promise<T>`
  - `jrnyClient.callJrny<T>({ trace, auth, method, path, body? }): Promise<T>` (the standalone `callJrny` export and the unused `extraHeaders` parameter are removed)
  - `jrnyClient.secretsOf(auth: JrnyAuth): string[]` → `[auth.bearerToken]`

- [ ] **Step 1: Wire the dependency and the test alias**

`packages/pieces/custom/jrny/package.json`: `"version": "0.1.0"`, add `"@jrnyflw/piece-trace": "workspace:*",` to `dependencies`.

Create `packages/pieces/custom/jrny/vitest.config.ts` with exactly the same content as the Nucleus one in Task 2 Step 1.

Run: `cd /home/linqadmin/repo/jrnyflw && bun install`
Expected: `packages/pieces/custom/jrny/node_modules/@jrnyflw/piece-trace` exists.

- [ ] **Step 2: Write the failing tests**

`packages/pieces/custom/jrny/test/trace.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { courierResponse } from '../src/lib/actions/courier-response';
import { buildJrnyAction } from '../src/lib/action-factory';
import { jrnyOperations } from '../src/lib/operations';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };

describe('jrny trace', () => {
    beforeEach(() => sendRequest.mockReset());

    test('Courier Response records the PATCH with the bearer token redacted', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { courierStatus: 'failed' } });
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'failed', errorMessage: 'Find Hub Code: ambiguous' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toEqual({
            ok: true,
            output: { courierStatus: 'failed' },
            sent: [{
                method: 'PATCH',
                url: 'https://jrny/api/v1/integration/entities/ent-1/dispatch-notes/DN-000026/courier-response',
                query: {},
                headers: { 'Content-Type': 'application/json', Authorization: '[redacted]' },
                body: { courierStatus: 'failed', errorMessage: 'Find Hub Code: ambiguous' },
                status: 200,
                durationMs: expect.any(Number),
            }],
        });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('continue mode returns a JRNY error envelope as data with its status', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config,
            data: { error: { code: 'CONFLICT', message: 'Waybill number already in use' } },
        })));
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'booked', waybillNumber: 'AON-1', onFailure: 'continue' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toMatchObject({
            ok: false,
            output: null,
            error: { message: 'JRNY API error 409 CONFLICT: Waybill number already in use', status: 409 },
        });
    });

    test('generated actions record the call through the real client', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { code: 'ACME' } });
        const action = buildJrnyAction({
            name: 'get_customer', displayName: 'Get Customer', description: '', method: 'GET',
            path: '/api/v1/integration/entities/{entityId}/customers/{code}', tag: 'x',
            pathParams: ['code'], queryParams: [], hasBody: false,
        });
        const result = await action.run({ ...createMockActionContext({ propsValue: { code: 'ACME' } }), auth });
        expect(result.output).toEqual({ code: 'ACME' });
        expect(result.sent[0]).toMatchObject({ method: 'GET', url: 'https://jrny/api/v1/integration/entities/ent-1/customers/ACME', headers: { Authorization: '[redacted]' } });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('no JRNY operation already uses a parameter named onFailure', () => {
        for (const op of jrnyOperations) {
            expect(op.pathParams).not.toContain('onFailure');
            expect(op.queryParams.map((q) => q.name)).not.toContain('onFailure');
        }
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/jrny && npx vitest run test/trace.test.ts`
Expected: FAIL (first three tests; `result.ok` / `result.sent` undefined). The fourth passes already; that's fine, it guards future regenerations.

- [ ] **Step 4: Rewrite the JRNY client**

Replace `packages/pieces/custom/jrny/src/lib/client.ts` with:

```ts
import { AuthenticationType, HttpError, HttpMethod } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
import { JrnyAuth } from './auth';

export class JrnyApiError extends Error {
  public readonly httpStatus: number;
  public readonly errorCode: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(httpStatus: number, envelope: JrnyErrorEnvelope) {
    super(`JRNY API error ${httpStatus} ${envelope.error.code}: ${envelope.error.message}`);
    this.name = 'JrnyApiError';
    this.httpStatus = httpStatus;
    this.errorCode = envelope.error.code;
    this.details = envelope.error.details;
    this.requestId = envelope.requestId;
  }
}

async function request<T>({ trace, auth, method, path, query, body }: JrnyRequest): Promise<T> {
  const response = await trace.send<T>({
    request: {
      method,
      url: joinUrl(auth.baseUrl, path),
      authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
      headers: { 'Content-Type': 'application/json' },
      queryParams: query,
      body,
    },
  });
  return response.body;
}

async function callJrny<T>({ trace, auth, method, path, body }: CallJrnyParams): Promise<T> {
  const url = `${trimTrailingSlash(auth.baseUrl)}${path}`;
  try {
    const response = await trace.send<T>({
      request: {
        method,
        url,
        authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    });
    return response.body;
  } catch (err) {
    if (err instanceof HttpError) {
      const status = err.response?.status ?? 0;
      const responseBody = err.response?.body;
      if (isJrnyErrorEnvelope(responseBody)) {
        throw new JrnyApiError(status, responseBody);
      }
      throw new Error(`JRNY API call to ${method} ${url} failed with HTTP ${status}: ${stringifyForLog(responseBody)}`);
    }
    throw err;
  }
}

function secretsOf(auth: JrnyAuth): string[] {
  return [auth.bearerToken];
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isJrnyErrorEnvelope(value: unknown): value is JrnyErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error: unknown = value.error;
  if (typeof error !== 'object' || error === null || !('code' in error) || !('message' in error)) return false;
  return typeof error.code === 'string' && typeof error.message === 'string';
}

function stringifyForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const jrnyClient = { callJrny, request, joinUrl, secretsOf };

type JrnyRequest = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

type CallJrnyParams = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  path: string;
  body?: unknown;
};

export type JrnyErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};
```

(`isJrnyErrorEnvelope` drops the old `as Record<string, unknown>` casts in favour of `in` narrowing; `JrnyApiError`'s two-argument constructor is unchanged.)

Run: `cd /home/linqadmin/repo/jrnyflw && grep -rn "callJrny\|JrnyErrorEnvelope\|JrnyApiError" packages/pieces/custom/jrny/src packages/pieces/custom/jrny/tools`
Expected: only `client.ts`, `create-quote.ts` and `courier-response.ts`. If `tools/` uses `callJrny`, update that call site to `jrnyClient.callJrny({ ... })` too.

- [ ] **Step 5: Wrap the generated actions**

In `packages/pieces/custom/jrny/src/lib/action-factory.ts` add `import { pieceTrace } from '@jrnyflw/piece-trace';`. Before `return createAction({`, add:

```ts
  props['onFailure'] = pieceTrace.onFailureProperty();
```

Replace the `run` with:

```ts
    async run(context) {
      const connection = context.auth.props;
      const values = context.propsValue;
      return pieceTrace.run({
        onFailure: values['onFailure'],
        secrets: jrnyClient.secretsOf(connection),
        work: async (trace) => {
          let path = op.path.replace('{entityId}', encodeURIComponent(connection.entityId));
          for (const p of op.pathParams) {
            path = path.replace(`{${p}}`, encodeURIComponent(stringifyValue(values[p])));
          }
          const query: Record<string, string> = {};
          for (const q of op.queryParams) {
            const v = values[q.name];
            if (v !== undefined && v !== '') {
              query[q.name] = stringifyValue(v);
            }
          }
          return jrnyClient.request({
            trace,
            auth: connection,
            method: METHODS[op.method],
            path,
            query,
            body: op.hasBody ? values['body'] : undefined,
          });
        },
      });
    },
```

- [ ] **Step 6: Wrap Courier Response and Create Quote**

`courier-response.ts`: change `import { callJrny } from '../client';` to `import { jrnyClient } from '../client';`, add `import { pieceTrace } from '@jrnyflw/piece-trace';`, add the prop `onFailure: pieceTrace.onFailureProperty(),` after `errorMessage`, and replace `run`:

```ts
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const body = {
          courierStatus: p.courierStatus,
          ...present('waybillNumber', p.waybillNumber),
          ...present('trackingUrl', p.trackingUrl),
          ...present('courierReference', p.courierReference),
          ...present('bookedAt', p.bookedAt),
          ...present('manifestNumber', p.manifestNumber),
          ...present('manifestDate', p.manifestDate),
          ...present('podSignedBy', p.podSignedBy),
          ...present('podSignedAt', p.podSignedAt),
          ...present('podNotes', p.podNotes),
          ...present('errorMessage', p.errorMessage),
        };
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/dispatch-notes/${encodeURIComponent(p.dispatchNumber.trim())}/courier-response`;
        return jrnyClient.callJrny({ trace, auth, method: HttpMethod.PATCH, path, body });
      },
    });
  },
```

`create-quote.ts`: same import changes, add `onFailure: pieceTrace.onFailureProperty(),` after `autoConvert`, and replace `run`:

```ts
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const lines = (p.lines ?? []) as Array<{
          stockCode: string;
          qty: number;
          unitPrice?: number;
          uom?: string;
        }>;

        const body: Record<string, unknown> = {
          customer: { code: p.customerCode },
          lines: lines.map((l) => ({
            stockCode: l.stockCode,
            qty: l.qty,
            ...(l.unitPrice !== undefined && l.unitPrice !== null ? { unitPrice: l.unitPrice } : {}),
            ...(l.uom ? { uom: l.uom } : {}),
          })),
        };

        if (p.notes) body['notes'] = p.notes;
        if (p.externalReference) body['externalReference'] = p.externalReference;
        if (p.autoConvert) body['autoConvert'] = true;

        const deliveryAddress = buildDeliveryAddress(p);
        if (deliveryAddress) body['deliveryAddress'] = deliveryAddress;

        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/quotations`;
        return jrnyClient.callJrny({ trace, auth, method: HttpMethod.POST, path, body });
      },
    });
  },
```

(The `as Array<...>` cast and `buildDeliveryAddress` are pre-existing and unchanged.)

- [ ] **Step 7: Update the existing JRNY tests**

`test/action-factory.test.ts`:
- line 4: `vi.mock('../src/lib/client', () => ({ jrnyClient: { request, secretsOf: () => [] } }));`
- line 21-26: add `trace: expect.anything(),` inside the first `expect.objectContaining({...})`, and change `expect(result).toEqual({ code: 'ACME' });` to `expect(result).toEqual({ ok: true, sent: [], output: { code: 'ACME' } });`
- in the second test's `expect.objectContaining({...})`, add `trace: expect.anything(),`.

`test/courier-response.test.ts` line 31: `expect(result.output).toEqual({ dispatchNumber: 'DN-000026', courierStatus: 'booked' });`

- [ ] **Step 8: Run the whole JRNY suite**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/jrny && npx vitest run`
Expected: PASS, 14 tests (10 existing + 4 new).

- [ ] **Step 9: Build, lint, commit**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/jrny && bun run build && npx eslint 'src/**/*.ts'`
Expected: build succeeds; eslint prints nothing.

```bash
cd /home/linqadmin/repo/jrnyflw
git add packages/pieces/custom/jrny bun.lock
git commit -m "feat(jrny): return the calls each action sent and optional failure data

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Shoprite actions return the trace

**Files:**
- Modify: `packages/pieces/custom/shoprite/package.json`, `packages/pieces/custom/shoprite/vitest.config.ts`
- Modify: `packages/pieces/custom/shoprite/src/lib/client.ts`, `src/lib/actions/{download-orders,acknowledge-orders,upload-invoice}.ts`
- Modify: `packages/pieces/custom/shoprite/test/download-orders.test.ts:28`
- Test: `packages/pieces/custom/shoprite/test/trace.test.ts`

**Interfaces:**
- Consumes: `pieceTrace`, `Tracer` from Task 1.
- Produces:
  - `shopriteClient.call<T>({ trace, auth, method, path, body? }): Promise<T>`
  - `shopriteClient.secretsOf(auth: ShopriteAuth): string[]` → `[auth.password, base64("username:password")]`

- [ ] **Step 1: Wire the dependency and the test alias**

`packages/pieces/custom/shoprite/package.json`: `"version": "0.1.0"`, add `"@jrnyflw/piece-trace": "workspace:*",` to `dependencies`. Replace `packages/pieces/custom/shoprite/vitest.config.ts` with exactly the Nucleus config from Task 2 Step 1.

Run: `cd /home/linqadmin/repo/jrnyflw && bun install`

- [ ] **Step 2: Write the failing test**

`packages/pieces/custom/shoprite/test/trace.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { uploadInvoice } from '../src/lib/actions/upload-invoice';

const PASSWORD = 'Sh0pr1te!pw';
const auth = { props: { baseUrl: 'https://x/b2bservice', username: 'vendor1', password: PASSWORD, contractId: 'C-77', invoiceEndpoint: 'VendorInvoice' } };

describe('shoprite trace', () => {
    beforeEach(() => sendRequest.mockReset());

    test('records the invoice POST, redacts both auth headers and keeps ContractID and UIUser', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: 'ok' });
        const invoiceMessage = { invoiceField: [{ invoiceIdentificationField: { entityIdentificationField: 'INV-1' } }] };
        const result = await uploadInvoice.run({ ...createMockActionContext({ propsValue: { invoiceMessage } }), auth });
        expect(result.output).toBe('ok');
        expect(result.sent[0]).toMatchObject({
            method: 'POST',
            url: 'https://x/b2bservice/api/VendorInvoice',
            headers: { Authorization: '[redacted]', Authentication: '[redacted]', ContractID: 'C-77', UIUser: 'vendor1' },
            body: invoiceMessage,
            status: 200,
        });
        const text = JSON.stringify(result);
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain(Buffer.from(`vendor1:${PASSWORD}`).toString('base64'));
    });

    test('continue mode returns an HTTP failure as data', async () => {
        sendRequest.mockRejectedValueOnce(new Error('socket hang up'));
        const result = await uploadInvoice.run({ ...createMockActionContext({ propsValue: { invoiceMessage: {}, onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({ ok: false, output: null, error: { message: 'socket hang up', status: null } });
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/shoprite && npx vitest run test/trace.test.ts`
Expected: FAIL (`result.sent` undefined).

- [ ] **Step 4: Thread `trace` through the Shoprite client**

In `packages/pieces/custom/shoprite/src/lib/client.ts`: change the first import to `import { HttpMethod } from '@activepieces/pieces-common';`, add `import { Tracer } from '@jrnyflw/piece-trace';`, and replace `call` and the export with:

```ts
async function call<T>({ trace, auth, method, path, body }: { trace: Tracer; auth: ShopriteAuth; method: HttpMethod; path: string; body?: unknown }): Promise<T> {
    const response = await trace.send<T>({
        request: {
            method,
            url: joinUrl(auth.baseUrl, path),
            headers: buildHeaders(auth),
            body,
        },
    });
    return response.body;
}

// The Authentication header carries the base64 credentials on their own, so that form must be scrubbed too.
function secretsOf(auth: ShopriteAuth): string[] {
    return [auth.password, Buffer.from(`${auth.username}:${auth.password}`).toString('base64')];
}

export const shopriteClient = { buildHeaders, joinUrl, call, secretsOf };
```

- [ ] **Step 5: Wrap the three actions**

Each gets `import { pieceTrace } from '@jrnyflw/piece-trace';` and `onFailure: pieceTrace.onFailureProperty(),` as the last prop.

`download-orders.ts` (`props: {}` becomes `props: { onFailure: pieceTrace.onFailureProperty() }`):

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) => shopriteClient.call({ trace, auth, method: HttpMethod.GET, path: '/api/VendorOrder' }),
        });
    },
```

`acknowledge-orders.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) =>
                shopriteClient.call({ trace, auth, method: HttpMethod.PUT, path: `/api/VendorOrder/${encodeURIComponent(context.propsValue.action)}` }),
        });
    },
```

`upload-invoice.ts`:

```ts
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) =>
                shopriteClient.call({
                    trace,
                    auth,
                    method: HttpMethod.POST,
                    path: `/api/${auth.invoiceEndpoint ?? 'VendorInvoice'}`,
                    body: context.propsValue.invoiceMessage,
                }),
        });
    },
```

- [ ] **Step 6: Update the existing test and run the suite**

`test/download-orders.test.ts` line 28: `expect(result.output).toEqual({ orderField: [] });`

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/shoprite && npx vitest run`
Expected: PASS, 6 tests.

- [ ] **Step 7: Build, lint, commit**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/shoprite && bun run build && npx eslint 'src/**/*.ts'`
Expected: build succeeds; eslint prints nothing.

```bash
cd /home/linqadmin/repo/jrnyflw
git add packages/pieces/custom/shoprite bun.lock
git commit -m "feat(shoprite): return the calls each action sent and optional failure data

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Flow migration tool

**Files:**
- Create: `packages/pieces/custom/trace/tools/migrate-flow.ts`, `packages/pieces/custom/trace/tools/migrate-flow-cli.ts`
- Test: `packages/pieces/custom/trace/test/migrate-flow.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure JSON transform).
- Produces: `flowMigration.migrate({ flow: unknown; pieceNames: string[]; pieceVersion: string }): { flow: unknown; steps: string[]; references: number }` — finds every object with `type: 'PIECE'` whose `settings.pieceName` is in `pieceNames`, sets its `settings.pieceVersion`, and inside every `{{ ... }}` template anywhere in the JSON rewrites `step_N` to `step_N.output` for those steps.

- [ ] **Step 1: Write the failing tests**

`packages/pieces/custom/trace/test/migrate-flow.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { flowMigration } from '../tools/migrate-flow';

const PIECES = ['@jrnyflw/nucleus', '@jrnyflw/jrny', '@jrnyflw/shoprite'];

function pieceStep({ name, pieceName, input, nextAction }: { name: string; pieceName: string; input: Record<string, unknown>; nextAction?: unknown }) {
    return { name, type: 'PIECE', settings: { pieceName, pieceVersion: '0.0.5', actionName: 'x', input }, ...(nextAction ? { nextAction } : {}) };
}

function sampleFlow() {
    const step3 = pieceStep({ name: 'step_3', pieceName: '@jrnyflw/jrny', input: { errorMessage: 'Hub: {{step_1.error.message}} / {{step_10}}' } });
    const router = {
        name: 'step_2',
        type: 'ROUTER',
        settings: { branches: [{ conditions: [[{ firstValue: '{{step_1.ok}}', operator: 'BOOLEAN_IS_FALSE' }]] }] },
        nextAction: step3,
    };
    const step10 = pieceStep({ name: 'step_10', pieceName: '@activepieces/piece-http', input: {} });
    const step1 = pieceStep({
        name: 'step_1',
        pieceName: '@jrnyflw/nucleus',
        input: { suburb: '{{trigger.body.suburb}}', note: 'step_1 outside braces' },
        nextAction: { ...router, nextAction: step10 },
    });
    return { template: { trigger: { name: 'trigger', type: 'PIECE_TRIGGER', nextAction: step1 } } };
}

describe('flowMigration.migrate', () => {
    test('rewrites references to traced steps anywhere in the flow and bumps their version', () => {
        const result = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        const text = JSON.stringify(result.flow);
        expect(result.steps).toEqual(['step_1', 'step_3']);
        expect(text).toContain('{{step_1.output.ok}}');
        expect(text).toContain('Hub: {{step_1.output.error.message}}');
        expect(text).toContain('step_1 outside braces');
        expect(text).toContain('{{trigger.body.suburb}}');
        expect(text.match(/"pieceVersion":"0.1.0"/g)).toHaveLength(2);
        expect(text.match(/"pieceVersion":"0.0.5"/g)).toHaveLength(1);
        expect(result.references).toBe(2);
    });

    test('does not confuse step_1 with step_10', () => {
        const result = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        expect(JSON.stringify(result.flow)).toContain('{{step_10}}');
    });

    test('rewrites a whole-step reference', () => {
        const flow = pieceStep({ name: 'step_1', pieceName: '@jrnyflw/nucleus', input: { all: '{{step_1}}', indexed: "{{step_1['ResultSets'][0]}}" } });
        const text = JSON.stringify(flowMigration.migrate({ flow, pieceNames: PIECES, pieceVersion: '0.1.0' }).flow);
        expect(text).toContain('{{step_1.output}}');
        expect(text).toContain("{{step_1.output['ResultSets'][0]}}");
    });

    test('is idempotent', () => {
        const once = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        const twice = flowMigration.migrate({ flow: once.flow, pieceNames: PIECES, pieceVersion: '0.1.0' });
        expect(twice.flow).toEqual(once.flow);
        expect(twice.references).toBe(0);
        expect(JSON.stringify(twice.flow)).not.toContain('.output.output');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/trace && npx vitest run test/migrate-flow.test.ts`
Expected: FAIL, cannot resolve `../tools/migrate-flow`.

- [ ] **Step 3: Implement the migration**

`packages/pieces/custom/trace/tools/migrate-flow.ts`:

```ts
function migrate({ flow, pieceNames, pieceVersion }: MigrateParams): MigrateResult {
    const steps = new Set<string>();
    collectSteps({ value: flow, pieceNames, steps });
    const ctx: RewriteContext = { steps, pieceNames, pieceVersion, references: 0 };
    const migrated = rewrite({ value: flow, ctx });
    return { flow: migrated, steps: [...steps].sort(), references: ctx.references };
}

function collectSteps({ value, pieceNames, steps }: { value: unknown; pieceNames: string[]; steps: Set<string> }): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectSteps({ value: item, pieceNames, steps }));
        return;
    }
    if (!isRecord(value)) {
        return;
    }
    const name = tracedStepName({ value, pieceNames });
    if (name !== null) {
        steps.add(name);
    }
    Object.values(value).forEach((item) => collectSteps({ value: item, pieceNames, steps }));
}

function rewrite({ value, ctx }: { value: unknown; ctx: RewriteContext }): unknown {
    if (typeof value === 'string') {
        return rewriteText({ text: value, ctx });
    }
    if (Array.isArray(value)) {
        return value.map((item) => rewrite({ value: item, ctx }));
    }
    if (!isRecord(value)) {
        return value;
    }
    const result: Record<string, unknown> = Object.fromEntries(
        Object.entries(value).map(([key, item]): [string, unknown] => [key, rewrite({ value: item, ctx })]),
    );
    const settings = result['settings'];
    if (tracedStepName({ value, pieceNames: ctx.pieceNames }) !== null && isRecord(settings)) {
        result['settings'] = { ...settings, pieceVersion: ctx.pieceVersion };
    }
    return result;
}

function rewriteText({ text, ctx }: { text: string; ctx: RewriteContext }): string {
    return text.replace(TEMPLATE, (_whole: string, expression: string) => {
        const rewritten = expression.replace(STEP_REFERENCE, (match: string, name: string) => {
            if (!ctx.steps.has(name)) {
                return match;
            }
            ctx.references += 1;
            return `${name}.output`;
        });
        return `{{${rewritten}}}`;
    });
}

function tracedStepName({ value, pieceNames }: { value: Record<string, unknown>; pieceNames: string[] }): string | null {
    const name = value['name'];
    const settings = value['settings'];
    if (value['type'] !== 'PIECE' || typeof name !== 'string' || !isRecord(settings)) {
        return null;
    }
    const pieceName = settings['pieceName'];
    return typeof pieceName === 'string' && pieceNames.includes(pieceName) ? name : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TEMPLATE = /\{\{([\s\S]*?)\}\}/g;
// The negative lookahead keeps a second run from producing step_N.output.output.
const STEP_REFERENCE = /\b(step_\d+)\b(?!\.output\b)/g;

export const flowMigration = { migrate };

type RewriteContext = { steps: Set<string>; pieceNames: string[]; pieceVersion: string; references: number };
type MigrateParams = { flow: unknown; pieceNames: string[]; pieceVersion: string };
type MigrateResult = { flow: unknown; steps: string[]; references: number };
```

`packages/pieces/custom/trace/tools/migrate-flow-cli.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { flowMigration } from './migrate-flow';

const PIECE_NAMES = ['@jrnyflw/jrny', '@jrnyflw/nucleus', '@jrnyflw/shoprite'];

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error('Usage: npx tsx packages/pieces/custom/trace/tools/migrate-flow-cli.ts <exported-flow.json> <migrated-flow.json>');
    process.exit(1);
}
const flow: unknown = JSON.parse(readFileSync(input, 'utf-8'));
const result = flowMigration.migrate({ flow, pieceNames: PIECE_NAMES, pieceVersion: '0.1.0' });
writeFileSync(output, `${JSON.stringify(result.flow, null, 2)}\n`);
console.log(`Steps migrated: ${result.steps.join(', ') || 'none'}`);
console.log(`References rewritten: ${result.references}`);
```


- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom/trace && npx vitest run`
Expected: PASS, 15 tests (11 helper + 4 migration).

- [ ] **Step 5: Smoke-test the CLI**

Run:

```bash
cd /home/linqadmin/repo/jrnyflw
S=/tmp/claude-1000/-home-linqadmin-repo-jrnyflw/f4f515ef-e6d9-4b10-a815-831c7052eed4/scratchpad
echo '{"name":"step_1","type":"PIECE","settings":{"pieceName":"@jrnyflw/nucleus","pieceVersion":"0.0.5","input":{"a":"{{step_1.hubCode}}"}}}' > $S/flow.json
npx tsx packages/pieces/custom/trace/tools/migrate-flow-cli.ts $S/flow.json $S/flow.migrated.json && cat $S/flow.migrated.json
```

Expected: prints `Steps migrated: step_1` and `References rewritten: 1`; the file has `"pieceVersion": "0.1.0"` and `"{{step_1.output.hubCode}}"`.

- [ ] **Step 6: Commit**

```bash
cd /home/linqadmin/repo/jrnyflw
git add packages/pieces/custom/trace/tools packages/pieces/custom/trace/test/migrate-flow.test.ts
git commit -m "feat(trace): add flow migration tool for the new step output shape

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Runbook and full verification

**Files:**
- Modify: `scripts/uat/DEPLOY-RUNBOOK.md` (new section after "### Redeploy after a code change")

**Interfaces:**
- Consumes: the CLI from Task 5; piece versions from Tasks 2-4.
- Produces: operator instructions.

- [ ] **Step 1: Add the runbook section**

Insert after the "### Redeploy after a code change" section of `scripts/uat/DEPLOY-RUNBOOK.md`:

```markdown
### One-off: piece trace upgrade (jrny / nucleus / shoprite 0.1.0)

These versions change what every JRNY, Nucleus and Shoprite step returns: the old fields move under `output`, next to `ok` and `sent`. Flows that reference these steps break until migrated.

1. In the builder, open each affected flow and export it (flow menu → Export). Today that is only the PROD courier flow.
2. On a workstation with the repo, run:
   `npx tsx packages/pieces/custom/trace/tools/migrate-flow-cli.ts courier-flow.json courier-flow.migrated.json`
   Check the printed step list and reference count, and skim the diff of the two files.
3. Take the database backup (see "Backups"), then redeploy at a quiet time (see "Redeploy after a code change").
4. As soon as the app is up: open the flow, import `courier-flow.migrated.json` (flow menu → Import), and publish.
5. Any run that failed between the redeploy and the publish: open it in Runs and retry "From failed step".
6. In the draft, click "Test step" on each JRNY/Nucleus step so the data selector shows the new shape.
7. Add the failure handling, then publish again. After each Nucleus step:
   - set "If the call fails" to "Continue and return the error";
   - add a Router with a branch where `{{step_N.ok}}` is false;
   - in that branch: JRNY "Courier Response" with Courier Status = Failed and Error Message = `<Step name>: {{step_N.error.message}}`, then a Code step that throws the same message so the run shows as failed.
```

- [ ] **Step 2: Run every affected suite**

Run:

```bash
cd /home/linqadmin/repo/jrnyflw/packages/pieces/custom
for p in trace nucleus jrny shoprite mapper; do echo "== $p"; (cd $p && npx vitest run 2>&1 | tail -4); done
```

Expected: all pass (trace 15, nucleus 45, jrny 14, shoprite 6, mapper unchanged).

- [ ] **Step 3: Build all custom pieces in turbo order**

Run: `cd /home/linqadmin/repo/jrnyflw && npx turbo run build --filter='./packages/pieces/custom/*'`
Expected: all succeed; `@jrnyflw/piece-trace#build` runs before the three pieces.

- [ ] **Step 4: Repo lint**

Run: `cd /home/linqadmin/repo/jrnyflw && npm run lint-dev`
Expected: no errors in the touched packages. (If unrelated pre-existing errors appear elsewhere, note them; don't fix them here.)

- [ ] **Step 5: Commit**

```bash
cd /home/linqadmin/repo/jrnyflw
git add scripts/uat/DEPLOY-RUNBOOK.md
git commit -m "docs(runbook): migration steps for the piece trace upgrade

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
