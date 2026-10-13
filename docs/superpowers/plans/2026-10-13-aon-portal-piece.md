# AON Customer Portal Piece Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `@jrnyflw/aon-portal` piece that lists an AON customer portal's orders (all pages) and acknowledges an order with the ERP order number.

**Architecture:** A custom piece under `packages/pieces/custom/aon-portal`, built like `@jrnyflw/shoprite`: a `CustomAuth` connection (Portal URL + API Key), a small client that sends through the `@jrnyflw/piece-trace` tracer, and actions wrapped in `pieceTrace.run`. `piece-trace` gains `x-api-key` in its always-redacted headers.

**Tech Stack:** TypeScript, Activepieces pieces-framework / pieces-common, vitest 3.0.8, Bun workspaces, Turbo.

**Spec:** `docs/superpowers/specs/2026-10-13-aon-portal-piece-design.md`

## Global Constraints

- Package `@jrnyflw/aon-portal`, version `0.1.0`, directory `packages/pieces/custom/aon-portal` (the `AP_DEV_PIECES` name is `aon-portal`).
- Display name "AON Customer Portal". It is not the `@jrnyflw/shoprite` piece.
- Connection: **Portal URL** (trailing slash ignored) and **API Key** (secret), sent as the `X-API-Key` header.
- List Orders: status dropdown with `processing` (default), `acknowledged`, `completed`, `cancelled`, `shipped`, `on_hold`; pages of 50; stop after 100 pages with "More than 5,000 orders with status <status>; narrow the status or ask for a date filter"; returns `{ orders, total }`.
- Acknowledge Order: Order ID must be a UUID, else fail before calling with "Order ID must be the order's id (a UUID), not its orderNumber"; sends `PUT /api/erp/orders/<id>/acknowledge` with `{"erpOrderNumber": "<trimmed>"}`.
- Every action except Custom API Call returns `{ ok, sent, output }` and has `onFailure: pieceTrace.onFailureProperty()`; `secretsOf(auth)` = `[apiKey]`.
- Connection validation: `GET /api/erp/orders?status=processing&limit=1`; 401 → "The portal rejected this API key"; other failure → its status and message.
- Code conventions (repo CLAUDE.md): no `any`, no `as` casts, named object parameters, exported consts/types at the end of the file, util exports grouped in one object, comments only for *why*.
- **Never call the acknowledge endpoint against the live portal.** Live checks are List Orders only.

## Review Focus

1. A Portal URL pasted with a trailing slash or with `/api/erp` on the end: expect the trailing slash to be ignored and `/api/erp` not to be doubled (Task 2 test).
2. A portal error that isn't JSON (an nginx 502 HTML page): expect a readable failure carrying the status, not a crash in the page parser (Task 3 test).
3. An ERP Order Number that is only spaces: expect a failure before any call, not an acknowledge with an empty number (Task 4 test).
4. A list response missing `orders` or `pagination`: expect "Unexpected response from the portal", not a silent empty list (Task 3 test).
5. Orders acknowledged by someone else while List Orders is paging can shift later pages and skip an order for that run. Accepted: the next daily run picks it up because it is still `processing`. No test; the reviewer should confirm nothing assumes the list is complete beyond one run.

---

### Task 1: piece-trace redacts X-API-Key

**Files:**
- Modify: `packages/pieces/custom/trace/src/lib/trace.ts` (`REDACTED_HEADERS`)
- Test: `packages/pieces/custom/trace/test/trace.test.ts`

**Interfaces:**
- Produces: any `X-API-Key` header (any case) is recorded in `sent[].headers` as `[redacted]`.

- [ ] **Step 1: Write the failing test** — add inside `describe('pieceTrace.run', …)`:

```ts
    test('redacts an X-API-Key header whatever its case', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', headers: { 'X-API-Key': 'k1', 'x-api-key': 'k2', Accept: 'application/json' } } });
            },
        });
        expect(result.sent[0].headers).toEqual({ 'X-API-Key': '[redacted]', 'x-api-key': '[redacted]', Accept: 'application/json' });
    });
```

- [ ] **Step 2: Run it** — `cd packages/pieces/custom/trace && npx vitest run` — Expected: 1 FAIL (`'X-API-Key': 'k1'` recorded).
- [ ] **Step 3: Implement** — `const REDACTED_HEADERS = ['authorization', 'authentication', 'x-api-key'];`
- [ ] **Step 4: Run it** — Expected: all trace tests PASS (19).
- [ ] **Step 5: Commit** — `git add packages/pieces/custom/trace && git commit -m "feat(trace): always redact the X-API-Key header"`

### Task 2: Package, connection and client

**Files:**
- Create: `packages/pieces/custom/aon-portal/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `vitest.config.ts` (copies of shoprite's, name changed)
- Create: `packages/pieces/custom/aon-portal/src/lib/auth.ts`, `src/lib/client.ts`, `src/index.ts` (actions list filled in Task 5; start with `actions: []`)
- Modify: `tsconfig.base.json` (path entry), `bun.lock` (via `bun install`)
- Test: `packages/pieces/custom/aon-portal/test/client.test.ts`

**Interfaces:**
- Produces: `aonPortalAuth` (CustomAuth, props `portalUrl`, `apiKey`), `type AonPortalAuth = { portalUrl: string; apiKey: string }`.
- Produces: `aonPortalClient = { joinUrl, call, secretsOf }` with
  `call<T>({ trace, auth, method, path, query?, body? }: { trace: Tracer; auth: AonPortalAuth; method: HttpMethod; path: string; query?: Record<string, string>; body?: unknown }): Promise<T>` and `secretsOf(auth): string[]`.

- [ ] **Step 1: Scaffold.** `package.json`:

```json
{
  "name": "@jrnyflw/aon-portal",
  "version": "0.1.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.lib.json && cp package.json dist/",
    "lint": "eslint 'src/**/*.ts'",
    "test": "vitest run"
  },
  "dependencies": {
    "@activepieces/pieces-common": "workspace:*",
    "@activepieces/pieces-framework": "workspace:*",
    "@activepieces/shared": "workspace:*",
    "@jrnyflw/piece-trace": "workspace:*",
    "tslib": "2.6.2"
  },
  "devDependencies": {
    "vitest": "3.0.8"
  }
}
```

Copy `tsconfig.json`, `tsconfig.lib.json` and `vitest.config.ts` from `packages/pieces/custom/shoprite/` unchanged. Add to `tsconfig.base.json` after the shoprite entry:

```json
      "@jrnyflw/aon-portal": [
        "packages/pieces/custom/aon-portal/src/index.ts"
      ],
```

Run `bun install` from the repo root (creates the workspace symlinks, updates `bun.lock`).

- [ ] **Step 2: Write the failing tests** — `test/client.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError, HttpMethod } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalClient } from '../src/lib/client';
import { aonPortalAuth } from '../src/lib/auth';

const API_KEY = 'a6205760-test-key-0000';
const auth = { portalUrl: 'https://portal.example/', apiKey: API_KEY };
const server = { apiUrl: 'https://ap/', publicUrl: 'https://ap/' };

function httpError({ status, data }: { status: number; data: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError(undefined, new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

describe('aonPortalClient', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('joins the URL without doubling slashes and sends the key header', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ok: 1 } });
        const result = await pieceTrace.run({
            onFailure: 'stop',
            secrets: aonPortalClient.secretsOf(auth),
            work: (trace) => aonPortalClient.call({ trace, auth, method: HttpMethod.GET, path: '/api/erp/orders', query: { status: 'processing' } }),
        });
        const req = sendRequest.mock.calls[0][0];
        expect(req.url).toBe('https://portal.example/api/erp/orders');
        expect(req.headers).toEqual({ 'X-API-Key': API_KEY, Accept: 'application/json' });
        expect(req.queryParams).toEqual({ status: 'processing' });
        expect(result.output).toEqual({ ok: 1 });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });

    test('does not double /api/erp when the Portal URL already ends with it', () => {
        expect(aonPortalClient.joinUrl({ base: 'https://portal.example/api/erp/', path: '/api/erp/orders' })).toBe('https://portal.example/api/erp/orders');
    });
});

describe('aonPortalAuth.validate', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('accepts a key the portal answers with 200', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { orders: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } } });
        expect(await aonPortalAuth.validate?.({ auth, server })).toEqual({ valid: true });
        expect(sendRequest.mock.calls[0][0].queryParams).toEqual({ status: 'processing', limit: '1' });
    });

    test('explains a rejected key', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 401, data: { error: 'API key required' } }));
        expect(await aonPortalAuth.validate?.({ auth, server })).toEqual({ valid: false, error: 'The portal rejected this API key' });
    });

    test('reports other failures with their status and never the key', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 502, data: '<html>Bad Gateway</html>' }));
        const result = await aonPortalAuth.validate?.({ auth, server });
        expect(result).toEqual({ valid: false, error: 'Could not reach the portal: HTTP 502: <html>Bad Gateway</html>' });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });
});
```

- [ ] **Step 3: Run it** — `cd packages/pieces/custom/aon-portal && npx vitest run` — Expected: FAIL, cannot load `../src/lib/client`.
- [ ] **Step 4: Implement** `src/lib/client.ts`:

```ts
import { HttpMethod } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
import { AonPortalAuth } from './auth';

function joinUrl({ base, path }: { base: string; path: string }): string {
    const root = base.trim().replace(/\/+$/, '').replace(/\/api\/erp$/i, '');
    return `${root}/${path.replace(/^\/+/, '')}`;
}

async function call<T>({ trace, auth, method, path, query, body }: CallParams): Promise<T> {
    const response = await trace.send<T>({
        request: {
            method,
            url: joinUrl({ base: auth.portalUrl, path }),
            headers: { 'X-API-Key': auth.apiKey, Accept: 'application/json' },
            queryParams: query,
            body,
        },
    });
    return response.body;
}

function secretsOf(auth: AonPortalAuth): string[] {
    return [auth.apiKey];
}

export const aonPortalClient = { joinUrl, call, secretsOf };

type CallParams = { trace: Tracer; auth: AonPortalAuth; method: HttpMethod; path: string; query?: Record<string, string>; body?: unknown };
```

`src/lib/auth.ts`:

```ts
import { HttpMethod } from '@activepieces/pieces-common';
import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalClient } from './client';

export const aonPortalAuth = PieceAuth.CustomAuth({
    description: 'Connect to an AON customer portal (for example https://shoprite.accessoffice.co.za). The portal team provides the API key.',
    required: true,
    props: {
        portalUrl: Property.ShortText({ displayName: 'Portal URL', description: 'For example https://shoprite.accessoffice.co.za', required: true }),
        apiKey: PieceAuth.SecretText({ displayName: 'API Key', required: true }),
    },
    validate: async ({ auth }) => {
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: aonPortalClient.secretsOf(auth),
            work: (trace) => aonPortalClient.call({ trace, auth, method: HttpMethod.GET, path: ORDERS_PATH, query: { status: 'processing', limit: '1' } }),
        });
        if (result.ok) {
            return { valid: true };
        }
        if (result.error.status === 401) {
            return { valid: false, error: 'The portal rejected this API key' };
        }
        return { valid: false, error: `Could not reach the portal: ${result.error.message}` };
    },
});

const ORDERS_PATH = '/api/erp/orders';

export type AonPortalAuth = { portalUrl: string; apiKey: string };
```

If `result.error` isn't narrowed by `result.ok` (check `TraceResult` in `trace/src/lib/trace.ts`), narrow with `if (result.ok === false)` the same way the trace tests do; no casts.

`src/index.ts`:

```ts
import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { aonPortalAuth } from './lib/auth';

export const aonPortal = createPiece({
    displayName: 'AON Customer Portal',
    description: 'AON customer ordering portals: list orders and acknowledge them with the ERP order number.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: aonPortalAuth,
    actions: [],
    triggers: [],
});
```

- [ ] **Step 5: Run it** — Expected: 5 PASS. Also `npx tsc -p tsconfig.lib.json --noEmit` — Expected: no errors.
- [ ] **Step 6: Commit** — `git add packages/pieces/custom/aon-portal tsconfig.base.json bun.lock && git commit -m "feat(aon-portal): connection and client for AON customer portals"`

### Task 3: List Orders

**Files:**
- Create: `packages/pieces/custom/aon-portal/src/lib/actions/list-orders.ts`
- Test: `packages/pieces/custom/aon-portal/test/list-orders.test.ts`

**Interfaces:**
- Consumes: `aonPortalClient.call`, `aonPortalClient.secretsOf`, `aonPortalAuth`.
- Produces: action `listOrders` (name `list_orders`); output `{ orders: unknown[]; total: number }`.

- [ ] **Step 1: Write the failing tests**:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { listOrders } from '../src/lib/actions/list-orders';

const API_KEY = 'a6205760-test-key-0000';
const auth = { props: { portalUrl: 'https://portal.example', apiKey: API_KEY } };

function page({ page, totalPages, total, orders }: { page: number; totalPages: number; total: number; orders: unknown[] }) {
    return { status: 200, body: { orders, pagination: { page, limit: 50, total, totalPages } } };
}

function run(propsValue: Record<string, unknown>) {
    return listOrders.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('listOrders', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('fetches every page and returns the orders once each, with the total', async () => {
        sendRequest
            .mockResolvedValueOnce(page({ page: 1, totalPages: 3, total: 5, orders: [{ id: 'a' }, { id: 'b' }] }))
            .mockResolvedValueOnce(page({ page: 2, totalPages: 3, total: 5, orders: [{ id: 'c' }, { id: 'd' }] }))
            .mockResolvedValueOnce(page({ page: 3, totalPages: 3, total: 5, orders: [{ id: 'e' }] }));
        const result = await run({ status: 'processing' });
        expect(result.output).toEqual({ orders: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }], total: 5 });
        expect(sendRequest.mock.calls.map((c) => c[0].queryParams)).toEqual([
            { status: 'processing', page: '1', limit: '50' },
            { status: 'processing', page: '2', limit: '50' },
            { status: 'processing', page: '3', limit: '50' },
        ]);
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });

    test('defaults to processing and returns an empty list when there are no orders', async () => {
        sendRequest.mockResolvedValueOnce(page({ page: 1, totalPages: 0, total: 0, orders: [] }));
        const result = await run({});
        expect(sendRequest.mock.calls[0][0].queryParams).toEqual(expect.objectContaining({ status: 'processing' }));
        expect(result.output).toEqual({ orders: [], total: 0 });
    });

    test('stops after 100 pages', async () => {
        sendRequest.mockResolvedValue(page({ page: 1, totalPages: 101, total: 5050, orders: [{ id: 'x' }] }));
        const result = await run({ status: 'cancelled', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'More than 5,000 orders with status cancelled; narrow the status or ask for a date filter' } });
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    test('fails clearly on a response without orders or pagination', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { error: 'nope' } });
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from the portal' } });
    });

    test('reports a non-JSON portal error with its status', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError(undefined, new AxiosError('Bad Gateway', 'ERR_BAD_RESPONSE', config, undefined, { status: 502, statusText: '', headers: {}, config, data: '<html>502 Bad Gateway</html>' })));
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'HTTP 502: <html>502 Bad Gateway</html>', status: 502 } });
    });
});
```

- [ ] **Step 2: Run it** — Expected: FAIL, cannot load `list-orders`.
- [ ] **Step 3: Implement** `src/lib/actions/list-orders.ts`:

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalAuth } from '../auth';
import { aonPortalClient } from '../client';

export const listOrders = createAction({
    auth: aonPortalAuth,
    name: 'list_orders',
    displayName: 'List Orders',
    description: 'All portal orders with a status, every page fetched. Returns { orders, total }.',
    props: {
        status: Property.StaticDropdown<OrderStatus>({
            displayName: 'Status',
            required: false,
            defaultValue: 'processing',
            options: { options: STATUSES.map((value) => ({ label: value, value })) },
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const status = context.propsValue.status ?? 'processing';
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: aonPortalClient.secretsOf(auth),
            work: async (trace) => {
                const orders: unknown[] = [];
                let total = 0;
                for (let pageNumber = 1; ; pageNumber++) {
                    const body = await aonPortalClient.call<unknown>({
                        trace,
                        auth,
                        method: HttpMethod.GET,
                        path: '/api/erp/orders',
                        query: { status, page: String(pageNumber), limit: String(PAGE_SIZE) },
                    });
                    if (!isOrderPage(body)) {
                        throw new Error('Unexpected response from the portal');
                    }
                    if (body.pagination.totalPages > MAX_PAGES) {
                        throw new Error(`More than ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en-US')} orders with status ${status}; narrow the status or ask for a date filter`);
                    }
                    orders.push(...body.orders);
                    total = body.pagination.total;
                    if (pageNumber >= body.pagination.totalPages) {
                        return { orders, total };
                    }
                }
            },
        });
    },
});

function isOrderPage(value: unknown): value is OrderPage {
    if (typeof value !== 'object' || value === null || !('orders' in value) || !('pagination' in value)) {
        return false;
    }
    const pagination: unknown = value.pagination;
    return (
        Array.isArray(value.orders) &&
        typeof pagination === 'object' &&
        pagination !== null &&
        'totalPages' in pagination &&
        typeof pagination.totalPages === 'number' &&
        'total' in pagination &&
        typeof pagination.total === 'number'
    );
}

const STATUSES: OrderStatus[] = ['processing', 'acknowledged', 'completed', 'cancelled', 'shipped', 'on_hold'];
const PAGE_SIZE = 50;
// Bounds a portal that keeps reporting more pages, so a flow step cannot loop forever.
const MAX_PAGES = 100;

type OrderStatus = 'processing' | 'acknowledged' | 'completed' | 'cancelled' | 'shipped' | 'on_hold';
type OrderPage = { orders: unknown[]; pagination: { total: number; totalPages: number } };
```

- [ ] **Step 4: Run it** — Expected: all PASS (5 client + 5 list).
- [ ] **Step 5: Commit** — `git add packages/pieces/custom/aon-portal && git commit -m "feat(aon-portal): List Orders action fetching every page"`

### Task 4: Acknowledge Order

**Files:**
- Create: `packages/pieces/custom/aon-portal/src/lib/actions/acknowledge-order.ts`
- Test: `packages/pieces/custom/aon-portal/test/acknowledge-order.test.ts`

**Interfaces:**
- Consumes: `aonPortalClient.call`, `aonPortalClient.secretsOf`, `aonPortalAuth`.
- Produces: action `acknowledgeOrder` (name `acknowledge_order`); output = the portal's response body.

- [ ] **Step 1: Write the failing tests**:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { acknowledgeOrder } from '../src/lib/actions/acknowledge-order';

const API_KEY = 'a6205760-test-key-0000';
const auth = { props: { portalUrl: 'https://portal.example', apiKey: API_KEY } };
const ORDER_ID = '573a4daa-1f9d-48a4-9e13-90f840fae544';

function run(propsValue: Record<string, unknown>) {
    return acknowledgeOrder.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('acknowledgeOrder', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('PUTs the trimmed ERP order number to the order', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { id: ORDER_ID, erpOrderNumber: 'QU-0001' } });
        const result = await run({ orderId: ` ${ORDER_ID} `, erpOrderNumber: ' QU-0001 ' });
        const req = sendRequest.mock.calls[0][0];
        expect(req.method).toBe('PUT');
        expect(req.url).toBe(`https://portal.example/api/erp/orders/${ORDER_ID}/acknowledge`);
        expect(req.body).toEqual({ erpOrderNumber: 'QU-0001' });
        expect(result.output).toEqual({ id: ORDER_ID, erpOrderNumber: 'QU-0001' });
    });

    test('rejects an orderNumber passed as the Order ID without calling the portal', async () => {
        const result = await run({ orderId: '10001', erpOrderNumber: 'QU-0001', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: "Order ID must be the order's id (a UUID), not its orderNumber" } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('rejects a blank ERP order number without calling the portal', async () => {
        const result = await run({ orderId: ORDER_ID, erpOrderNumber: '   ', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'ERP Order Number is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('a failed acknowledge never shows the API key', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({ erpOrderNumber: 'QU-0001' }, new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { status: 401, statusText: '', headers: {}, config, data: { error: 'API key required' } })));
        const result = await run({ orderId: ORDER_ID, erpOrderNumber: 'QU-0001', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { status: 401 } });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });
});
```

- [ ] **Step 2: Run it** — Expected: FAIL, cannot load `acknowledge-order`.
- [ ] **Step 3: Implement** `src/lib/actions/acknowledge-order.ts`:

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalAuth } from '../auth';
import { aonPortalClient } from '../client';

export const acknowledgeOrder = createAction({
    auth: aonPortalAuth,
    name: 'acknowledge_order',
    displayName: 'Acknowledge Order',
    description: "Set the ERP order number on a portal order, which moves it out of processing. Use the order's id, not its orderNumber.",
    props: {
        orderId: Property.ShortText({ displayName: 'Order ID', description: "The order's id (a UUID) from List Orders.", required: true }),
        erpOrderNumber: Property.ShortText({ displayName: 'ERP Order Number', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: aonPortalClient.secretsOf(auth),
            work: async (trace) => {
                const orderId = p.orderId.trim();
                const erpOrderNumber = p.erpOrderNumber.trim();
                if (!UUID.test(orderId)) {
                    throw new Error("Order ID must be the order's id (a UUID), not its orderNumber");
                }
                if (erpOrderNumber === '') {
                    throw new Error('ERP Order Number is required');
                }
                return aonPortalClient.call<unknown>({
                    trace,
                    auth,
                    method: HttpMethod.PUT,
                    path: `/api/erp/orders/${encodeURIComponent(orderId)}/acknowledge`,
                    body: { erpOrderNumber },
                });
            },
        });
    },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

- [ ] **Step 4: Run it** — Expected: all PASS (14).
- [ ] **Step 5: Commit** — `git add packages/pieces/custom/aon-portal && git commit -m "feat(aon-portal): Acknowledge Order action"`

### Task 5: Custom API Call, piece wiring, build and live check

**Files:**
- Create: `packages/pieces/custom/aon-portal/src/lib/actions/custom-api-call.ts`
- Modify: `packages/pieces/custom/aon-portal/src/index.ts` (actions list)
- Modify: `scripts/uat/DEPLOY-RUNBOOK.md` (one line: add `aon-portal` to `AP_DEV_PIECES`)
- Test: `packages/pieces/custom/aon-portal/test/piece.test.ts`

**Interfaces:**
- Consumes: `listOrders`, `acknowledgeOrder`, `aonPortalAuth`.
- Produces: `aonPortal` piece exporting actions `list_orders`, `acknowledge_order`, `custom_api_call`.

- [ ] **Step 1: Write the failing test** — `test/piece.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { aonPortal } from '../src';

test('the piece exposes List Orders, Acknowledge Order and Custom API Call', () => {
    expect(Object.keys(aonPortal.actions()).sort()).toEqual(['acknowledge_order', 'custom_api_call', 'list_orders']);
});
```

- [ ] **Step 2: Run it** — Expected: FAIL (no actions).
- [ ] **Step 3: Implement** `src/lib/actions/custom-api-call.ts`:

```ts
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { aonPortalAuth } from '../auth';

export const customApiCall = createCustomApiCallAction({
    auth: aonPortalAuth,
    baseUrl: (auth) => (auth?.props.portalUrl ?? '').trim().replace(/\/+$/, ''),
    authMapping: async (auth) => ({ 'X-API-Key': auth.props.apiKey }),
});
```

Set `actions: [listOrders, acknowledgeOrder, customApiCall]` in `src/index.ts` with the imports. If `createCustomApiCallAction`'s callbacks are typed differently here than in shoprite's `custom-api-call.ts`, copy shoprite's signature exactly.

- [ ] **Step 4: Run it** — Expected: all PASS (15). Then from the repo root:
  - `npx turbo run build lint --filter=@jrnyflw/aon-portal --filter=@jrnyflw/piece-trace` — Expected: all tasks successful.
  - `node -e "console.log(Object.keys(require('./packages/pieces/custom/aon-portal/dist/src/index.js').aonPortal.actions()))"` — Expected: the three action names.
  - Run every custom piece suite (trace, nucleus, jrny, shoprite, mapper, aon-portal) — Expected: all PASS.
- [ ] **Step 5: Live read-only check.** In the session scratchpad, a tsx script runs `listOrders` with `AON_URL=https://shoprite.accessoffice.co.za` and `AON_KEY` from the environment, and prints `total`, the order numbers, `sent.length` and whether the key appears in the result. Expected: the current `processing` orders, one call, key absent. **Do not run Acknowledge Order.**
- [ ] **Step 6: Runbook.** In `scripts/uat/DEPLOY-RUNBOOK.md`, wherever custom pieces in `AP_DEV_PIECES` are described, add that `aon-portal` must be listed for the AON Customer Portal piece to appear.
- [ ] **Step 7: Commit** — `git add packages/pieces/custom/aon-portal scripts/uat/DEPLOY-RUNBOOK.md && git commit -m "feat(aon-portal): Custom API Call and piece wiring"`
