# Shoprite + Nucleus Integration Pieces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two app pieces — `@jrnyflw/shoprite` (Shoprite B2B Supplier API, GS1 eCom) and `@jrnyflw/nucleus` (Winfreight FMS courier API) — each with a connection, the priority actions for the orders/invoice/shipping flows, and a `custom_api_call` for full coverage.

**Architecture:** Each piece mirrors `@jrnyflw/jrny` (`auth.ts` + `client.ts` + `actions/`). Pure helpers (auth-header building, URL normalization, parcel-array packing, token caching) are unit-tested; action `run()` bodies are thin wrappers over the client and verified with `createMockActionContext` + a mocked `httpClient`. Shoprite uses Basic-style header auth; Nucleus uses a cached OAuth2 bearer token. `custom_api_call` (from `@activepieces/pieces-common`) gives every endpoint immediately.

**Tech Stack:** Activepieces pieces-framework (`createPiece`/`createAction`/`PieceAuth`/`Property`), `@activepieces/pieces-common` (`httpClient`, `HttpMethod`, `createCustomApiCallAction`), Vitest.

**Reference docs:** `docs/integrations/nucleus/Winfreight_FMS_postman_collection.json`; Shoprite help `https://b2b.shopriteholdings.co.za/B2BWebAPISupplierServices/Help`. Background in memory: `shoprite_b2b_api.md`, `nucleus_winfreight_api.md`.

**Decisions locked:** Nucleus waybill = `CreateWaybill_Inhouse` (one-shot). GRN source = Nucleus POD/tracking (poll). Shoprite invoice endpoint = configurable connection field, default `VendorInvoice`.

---

## Shared conventions (binding)

- Pieces live in **`packages/pieces/custom/<dir>/`** (NOT `community/`). Mirror `packages/pieces/custom/jrny/` exactly (package.json, tsconfig.json, tsconfig.lib.json, .eslintrc.json — copy jrny's verbatim; vitest.config.ts like the mapper piece).
- Piece source style: this matches the **pieces packages**, which use **4-space indentation, single quotes, semicolons optional per existing piece files** — match the sibling `jrny` piece's style exactly (read a jrny file first). No `any`, no `as` casts (guarded narrowing only).
- Tests live **inside the piece** under `test/` (e.g. `packages/pieces/custom/shoprite/test/<name>.test.ts`), run with `cd packages/pieces/custom/<dir> && npx vitest run`. Use `import { createMockActionContext } from '@activepieces/pieces-framework'` for action tests and `vi.mock('@activepieces/pieces-common', …)` to stub `httpClient`.
- HTTP: use `httpClient.sendRequest({ method, url, headers, queryParams, body })` from `@activepieces/pieces-common`. `queryParams` is `Record<string, string>`.
- **Registration (per piece):** add the tsconfig path in `tsconfig.base.json` (`"@jrnyflw/<dir>": ["packages/pieces/custom/<dir>/src/index.ts"]`); run `bun install`; **build** (`cd packages/pieces/custom/<dir> && bun run build`); and the user adds `<dir>` to `AP_DEV_PIECES` in `.env.dev` then restarts `npm run dev`. (A dev piece only appears if it's in `AP_DEV_PIECES` AND has a built `dist/`.)
- PR label when shipping: `feature` + `area/third-party-pieces`.

---

# PART A — `@jrnyflw/shoprite`

API base (prod): `https://externalservices.shopriteholdings.co.za/b2bservice`; routes `/api/<Controller>`. Auth headers on every call (`b64 = base64("username:password")`): `Authorization: Basic {b64}`, `Authentication: {b64}`, `ContractID: {contractId}`, `UIUser: {username}`. Bodies/responses are GS1 eCom JSON (`OrderMessageType` / `InvoiceMessageType`).

## Task A1: Scaffold the shoprite piece

**Files:**
- Create: `packages/pieces/custom/shoprite/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json`, `vitest.config.ts`, `src/index.ts`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Read `packages/pieces/custom/jrny/`** (package.json, tsconfig.json, tsconfig.lib.json, .eslintrc.json, src/index.ts) and `packages/pieces/custom/mapper/vitest.config.ts` to copy structure/style exactly.

- [ ] **Step 2: Create the configs** mirroring jrny, with `package.json` name `@jrnyflw/shoprite`, version `0.0.1`, scripts `build`/`lint`/`test` (`"test": "vitest run"`), deps `@activepieces/pieces-common`, `@activepieces/pieces-framework`, `@activepieces/shared` (all `workspace:*`), `tslib` `2.6.2`, devDep `vitest` `3.0.8`. Copy jrny's `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json` verbatim; copy mapper's `vitest.config.ts`.

- [ ] **Step 3: Create `src/index.ts`** (actions added in later tasks; start with an empty actions array referencing imports added as you go — for now import nothing and use `actions: []`):
```ts
import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { shopriteAuth } from './lib/auth';

export const shoprite = createPiece({
    displayName: 'Shoprite',
    description: 'Shoprite B2B Supplier Services (GS1 eCom) — download orders, acknowledge, and upload invoices.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: shopriteAuth,
    actions: [],
    triggers: [],
});
```

- [ ] **Step 4: Add the tsconfig path** in `tsconfig.base.json` `compilerOptions.paths` alongside the other `@jrnyflw/*` entries:
```json
"@jrnyflw/shoprite": [
  "packages/pieces/custom/shoprite/src/index.ts"
],
```
- [ ] **Step 5: `bun install`** from repo root (confirm it resolves). The piece won't typecheck until A2 adds `auth.ts` — that's expected; don't build yet.
- [ ] **Step 6: Commit**
```bash
git add packages/pieces/custom/shoprite tsconfig.base.json
git commit -m "feat(shoprite): scaffold @jrnyflw/shoprite piece" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task A2: Auth + client (header building)

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/auth.ts`
- Create: `packages/pieces/custom/shoprite/src/lib/client.ts`
- Create: `packages/pieces/custom/shoprite/test/client.test.ts`

- [ ] **Step 1: Write the failing test** — `test/client.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { shopriteClient } from '../src/lib/client';

describe('shopriteClient.buildHeaders', () => {
    test('builds the four auth headers with base64 basic credentials', () => {
        const headers = shopriteClient.buildHeaders({
            baseUrl: 'https://x/b2bservice',
            username: 'acme',
            password: 'secret',
            contractId: 'cid-123',
            invoiceEndpoint: 'VendorInvoice',
        });
        const b64 = Buffer.from('acme:secret').toString('base64');
        expect(headers).toEqual({
            Authorization: `Basic ${b64}`,
            Authentication: b64,
            ContractID: 'cid-123',
            UIUser: 'acme',
        });
    });

    test('joinUrl normalizes slashes between base and path', () => {
        expect(shopriteClient.joinUrl('https://x/b2bservice/', '/api/VendorOrder')).toBe('https://x/b2bservice/api/VendorOrder');
        expect(shopriteClient.joinUrl('https://x/b2bservice', 'api/VendorOrder')).toBe('https://x/b2bservice/api/VendorOrder');
    });
});
```

- [ ] **Step 2: Run, verify FAIL** — `cd packages/pieces/custom/shoprite && npx vitest run test/client.test.ts`

- [ ] **Step 3: Implement** `src/lib/auth.ts`:
```ts
import { PieceAuth, Property } from '@activepieces/pieces-framework';

const markdown = `
Connect to Shoprite B2B Supplier Services.

You need (from Shoprite): your **Username** and **Password**, your **Contract ID**, and the **Base URL** (production: \`https://externalservices.shopriteholdings.co.za/b2bservice\`).
Credentials are sent as an encrypted (Base64) Authorization header plus Shoprite's required \`Authentication\`, \`ContractID\` and \`UIUser\` headers.
`;

export const shopriteAuth = PieceAuth.CustomAuth({
    description: markdown,
    required: true,
    props: {
        baseUrl: Property.ShortText({
            displayName: 'Base URL',
            description: 'API root, no trailing slash. Production: https://externalservices.shopriteholdings.co.za/b2bservice',
            required: true,
        }),
        username: Property.ShortText({ displayName: 'Username', required: true }),
        password: PieceAuth.SecretText({ displayName: 'Password', required: true }),
        contractId: Property.ShortText({ displayName: 'Contract ID', required: true }),
        invoiceEndpoint: Property.StaticDropdown<'VendorInvoice' | 'B2BInvoice'>({
            displayName: 'Invoice Endpoint',
            description: 'Which Shoprite invoice controller to POST invoices to. Confirm with Shoprite before go-live.',
            required: true,
            defaultValue: 'VendorInvoice',
            options: {
                options: [
                    { label: 'VendorInvoice', value: 'VendorInvoice' },
                    { label: 'B2BInvoice', value: 'B2BInvoice' },
                ],
            },
        }),
    },
});

export type ShopriteAuth = {
    baseUrl: string;
    username: string;
    password: string;
    contractId: string;
    invoiceEndpoint: 'VendorInvoice' | 'B2BInvoice';
};
```

`src/lib/client.ts`:
```ts
import { HttpMethod, HttpHeaders, httpClient } from '@activepieces/pieces-common';
import { ShopriteAuth } from './auth';

function buildHeaders(auth: ShopriteAuth): HttpHeaders {
    const b64 = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return {
        Authorization: `Basic ${b64}`,
        Authentication: b64,
        ContractID: auth.contractId,
        UIUser: auth.username,
    };
}

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function call<T>(auth: ShopriteAuth, method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await httpClient.sendRequest<T>({
        method,
        url: joinUrl(auth.baseUrl, path),
        headers: buildHeaders(auth),
        body,
    });
    return response.body;
}

export const shopriteClient = { buildHeaders, joinUrl, call };
```

- [ ] **Step 4: Run, verify PASS** (2 tests).
- [ ] **Step 5: Commit**
```bash
git add packages/pieces/custom/shoprite/src/lib/auth.ts packages/pieces/custom/shoprite/src/lib/client.ts packages/pieces/custom/shoprite/test/client.test.ts
git commit -m "feat(shoprite): connection auth + http client" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task A3: `download_orders` + `acknowledge_orders` actions

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/actions/download-orders.ts`, `acknowledge-orders.ts`
- Create: `packages/pieces/custom/shoprite/test/download-orders.test.ts`

- [ ] **Step 1: Write the failing test** — `test/download-orders.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const sendRequest = vi.fn();
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { downloadOrders } from '../src/lib/actions/download-orders';

const auth = { baseUrl: 'https://x/b2bservice', username: 'u', password: 'p', contractId: 'c', invoiceEndpoint: 'VendorInvoice' };

describe('downloadOrders', () => {
    test('GETs /api/VendorOrder with the auth headers and returns the body', async () => {
        sendRequest.mockResolvedValue({ body: { orderField: [] } });
        const ctx = createMockActionContext({ auth, propsValue: {} });
        const result = await downloadOrders.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://x/b2bservice/api/VendorOrder',
            headers: expect.objectContaining({ ContractID: 'c', UIUser: 'u' }),
        }));
        expect(result).toEqual({ orderField: [] });
    });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `download-orders.ts`:
```ts
import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

export const downloadOrders = createAction({
    auth: shopriteAuth,
    name: 'download_orders',
    displayName: 'Download Orders',
    description: 'Download new (un-acknowledged) orders for the vendor (GS1 OrderMessageType).',
    props: {},
    async run(context) {
        return shopriteClient.call(context.auth, HttpMethod.GET, '/api/VendorOrder');
    },
});
```

`acknowledge-orders.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

export const acknowledgeOrders = createAction({
    auth: shopriteAuth,
    name: 'acknowledge_orders',
    displayName: 'Acknowledge Orders',
    description: 'Acknowledge (or reset) downloaded orders so they are not returned again. Set the action code as confirmed with Shoprite.',
    props: {
        action: Property.ShortText({
            displayName: 'Action',
            description: 'Acknowledge/reset action code expected by Shoprite (path segment for PUT /api/VendorOrder/{action}).',
            required: true,
            defaultValue: 'Acknowledge',
        }),
    },
    async run(context) {
        const action = encodeURIComponent(context.propsValue.action);
        return shopriteClient.call(context.auth, HttpMethod.PUT, `/api/VendorOrder/${action}`);
    },
});
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit**
```bash
git add packages/pieces/custom/shoprite/src/lib/actions/download-orders.ts packages/pieces/custom/shoprite/src/lib/actions/acknowledge-orders.ts packages/pieces/custom/shoprite/test/download-orders.test.ts
git commit -m "feat(shoprite): download + acknowledge orders actions" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task A4: `upload_invoice` action (configurable endpoint)

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/actions/upload-invoice.ts`
- Create: `packages/pieces/custom/shoprite/test/upload-invoice.test.ts`

- [ ] **Step 1: Write the failing test** — `test/upload-invoice.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';
const sendRequest = vi.fn();
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});
import { createMockActionContext } from '@activepieces/pieces-framework';
import { uploadInvoice } from '../src/lib/actions/upload-invoice';

describe('uploadInvoice', () => {
    test('POSTs the GS1 invoice body to the configured invoice endpoint', async () => {
        sendRequest.mockResolvedValue({ body: 'ok' });
        const invoiceMessage = { invoiceField: [{ invoiceIdentificationField: { entityIdentificationField: 'INV-1' } }] };
        const ctx = createMockActionContext({
            auth: { baseUrl: 'https://x/b2bservice', username: 'u', password: 'p', contractId: 'c', invoiceEndpoint: 'B2BInvoice' },
            propsValue: { invoiceMessage },
        });
        await uploadInvoice.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'POST',
            url: 'https://x/b2bservice/api/B2BInvoice',
            body: invoiceMessage,
        }));
    });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `upload-invoice.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

export const uploadInvoice = createAction({
    auth: shopriteAuth,
    name: 'upload_invoice',
    displayName: 'Upload Invoice',
    description: 'POST a GS1 InvoiceMessageType document to Shoprite. Build the message with the Mapper from your JRNY invoice data.',
    props: {
        invoiceMessage: Property.Json({
            displayName: 'Invoice Message (GS1)',
            description: 'The full GS1 InvoiceMessageType JSON. Produce this with the Mapper step.',
            required: true,
        }),
    },
    async run(context) {
        return shopriteClient.call(
            context.auth,
            HttpMethod.POST,
            `/api/${context.auth.invoiceEndpoint}`,
            context.propsValue.invoiceMessage,
        );
    },
});
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit**
```bash
git add packages/pieces/custom/shoprite/src/lib/actions/upload-invoice.ts packages/pieces/custom/shoprite/test/upload-invoice.test.ts
git commit -m "feat(shoprite): upload invoice action" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task A5: Custom API Call + register actions + build

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/actions/custom-api-call.ts`
- Modify: `packages/pieces/custom/shoprite/src/index.ts`

- [ ] **Step 1: Implement** `custom-api-call.ts`:
```ts
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

export const customApiCall = createCustomApiCallAction({
    auth: shopriteAuth,
    baseUrl: (auth) => (auth as { baseUrl: string }).baseUrl,
    authMapping: async (auth) => shopriteClient.buildHeaders(auth as Parameters<typeof shopriteClient.buildHeaders>[0]),
});
```
> Note on the two casts: `createCustomApiCallAction`'s generic `auth` param is widened by the helper; the codebase's existing custom-api-call usages in other pieces cast similarly. If a sibling piece avoids the cast, follow that pattern instead. Prefer a typed `authMapping` if it compiles without casts.

- [ ] **Step 2: Register all actions** in `src/index.ts`:
```ts
import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { shopriteAuth } from './lib/auth';
import { downloadOrders } from './lib/actions/download-orders';
import { acknowledgeOrders } from './lib/actions/acknowledge-orders';
import { uploadInvoice } from './lib/actions/upload-invoice';
import { customApiCall } from './lib/actions/custom-api-call';

export const shoprite = createPiece({
    displayName: 'Shoprite',
    description: 'Shoprite B2B Supplier Services (GS1 eCom) — download orders, acknowledge, and upload invoices.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: shopriteAuth,
    actions: [downloadOrders, acknowledgeOrders, uploadInvoice, customApiCall],
    triggers: [],
});
```

- [ ] **Step 3: Run all shoprite tests** — `cd packages/pieces/custom/shoprite && npx vitest run` → all pass.
- [ ] **Step 4: Build the piece** — `cd packages/pieces/custom/shoprite && bun run build` → `dist/src/index.js` exists, no type errors.
- [ ] **Step 5: Commit**
```bash
git add packages/pieces/custom/shoprite/src
git commit -m "feat(shoprite): custom API call + register actions" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# PART B — `@jrnyflw/nucleus`

Base URL from Winfreight (connection field). Auth: `GET {base}/token` form-urlencoded `{username, password, grant_type=password}` → `{ access_token, expires_in }`; cache for `expires_in`; send `Authorization: Bearer {token}` + `GroupName` query param on every call. Most actions pass data as **query params**.

## Task B1: Scaffold the nucleus piece

**Files:** mirror Task A1 for dir `nucleus`, name `@jrnyflw/nucleus`, displayName `Nucleus`, description `Nucleus (Winfreight FMS) courier — create waybills, track shipments, fetch PODs and labels.`, category `PieceCategory.SALES_AND_CRM` (closest fit), `logoUrl` `https://cdn.activepieces.com/pieces/webhook.png`, `auth: nucleusAuth`, `actions: []`. Add `tsconfig.base.json` path `@jrnyflw/nucleus`. `bun install`. Commit `feat(nucleus): scaffold @jrnyflw/nucleus piece`.

## Task B2: Auth + token-caching client

**Files:**
- Create: `packages/pieces/custom/nucleus/src/lib/auth.ts`, `src/lib/client.ts`
- Create: `packages/pieces/custom/nucleus/test/client.test.ts`

- [ ] **Step 1: Write the failing test** — `test/client.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { nucleusClient } from '../src/lib/client';

describe('nucleusClient helpers', () => {
    test('joinUrl normalizes the inconsistent trailing slash', () => {
        expect(nucleusClient.joinUrl('https://api/', '/GetTracking')).toBe('https://api/GetTracking');
        expect(nucleusClient.joinUrl('https://api', 'GetTracking')).toBe('https://api/GetTracking');
    });

    test('isExpired returns true when now is past the stored expiry', () => {
        expect(nucleusClient.isExpired({ token: 't', expiresAt: 1000 }, 2000)).toBe(true);
        expect(nucleusClient.isExpired({ token: 't', expiresAt: 5000 }, 2000)).toBe(false);
    });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `src/lib/auth.ts`:
```ts
import { PieceAuth, Property } from '@activepieces/pieces-framework';

export const nucleusAuth = PieceAuth.CustomAuth({
    description: 'Connect to Nucleus (Winfreight FMS). Base URL, API Username/Password, and Group Name are provided by Winfreight.',
    required: true,
    props: {
        baseUrl: Property.ShortText({ displayName: 'Base URL', description: 'Winfreight API root (provided by Winfreight).', required: true }),
        username: Property.ShortText({ displayName: 'Username', required: true }),
        password: PieceAuth.SecretText({ displayName: 'Password', required: true }),
        groupName: Property.ShortText({ displayName: 'Group Name', description: 'GroupName provided by Winfreight; sent on every request.', required: true }),
    },
});

export type NucleusAuth = {
    baseUrl: string;
    username: string;
    password: string;
    groupName: string;
};
```

`src/lib/client.ts` (token fetch + cache via `context.store`, bearer + GroupName injection):
```ts
import { HttpMethod, QueryParams, httpClient } from '@activepieces/pieces-common';
import { NucleusAuth } from './auth';

type CachedToken = { token: string; expiresAt: number };
const TOKEN_STORE_KEY = 'nucleus_token';

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isExpired(cached: CachedToken, nowMs: number): boolean {
    return cached.expiresAt <= nowMs;
}

function isCachedToken(value: unknown): value is CachedToken {
    return typeof value === 'object' && value !== null
        && typeof (value as Record<string, unknown>)['token'] === 'string'
        && typeof (value as Record<string, unknown>)['expiresAt'] === 'number';
}

async function fetchToken(auth: NucleusAuth): Promise<CachedToken> {
    const response = await httpClient.sendRequest<{ access_token: string; expires_in: number }>({
        method: HttpMethod.POST,
        url: joinUrl(auth.baseUrl, '/token'),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(auth.username)}&password=${encodeURIComponent(auth.password)}&grant_type=password`,
    });
    const expiresInMs = (response.body.expires_in ?? 3599) * 1000;
    return { token: response.body.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
}

type StoreLike = { get: (k: string) => Promise<unknown>; put: <T>(k: string, v: T) => Promise<T> };

async function getToken(auth: NucleusAuth, store: StoreLike): Promise<string> {
    const cached = await store.get(TOKEN_STORE_KEY);
    if (isCachedToken(cached) && !isExpired(cached, Date.now())) {
        return cached.token;
    }
    const fresh = await fetchToken(auth);
    await store.put(TOKEN_STORE_KEY, fresh);
    return fresh.token;
}

async function call<T>(params: {
    auth: NucleusAuth;
    store: StoreLike;
    method: HttpMethod;
    path: string;
    query?: QueryParams;
    body?: unknown;
}): Promise<T> {
    const token = await getToken(params.auth, params.store);
    const response = await httpClient.sendRequest<T>({
        method: params.method,
        url: joinUrl(params.auth.baseUrl, params.path),
        headers: { Authorization: `Bearer ${token}` },
        queryParams: { ...(params.query ?? {}), GroupName: params.auth.groupName },
        body: params.body,
    });
    return response.body;
}

export const nucleusClient = { joinUrl, isExpired, getToken, call };
```
> The token endpoint is implemented as **POST** (standard OAuth2 password grant) even though the Postman collection labels it GET-with-body — confirm against the live API during testing; if the server requires GET, switch the method (the form body stays the same).

- [ ] **Step 4: Run, verify PASS** (2 tests).
- [ ] **Step 5: Commit** `feat(nucleus): connection auth + token-caching client`.

## Task B3: `create_waybill` action (CreateWaybill_Inhouse) + parcel packing

**Files:**
- Create: `packages/pieces/custom/nucleus/src/lib/parcels.ts`, `src/lib/actions/create-waybill.ts`
- Create: `packages/pieces/custom/nucleus/test/parcels.test.ts`

`CreateWaybill_Inhouse` takes parcel data as parallel comma-joined arrays. A `parcels` array prop → joined strings.

- [ ] **Step 1: Write the failing test** — `test/parcels.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { nucleusParcels } from '../src/lib/parcels';

describe('packParcels', () => {
    test('joins parcel rows into the parallel comma-separated arrays the API expects', () => {
        const out = nucleusParcels.packParcels([
            { parcelNo: 'P1', items: 1, length: 10, width: 11, height: 12, weight: 5 },
            { parcelNo: 'P2', items: 2, length: 20, width: 21, height: 22, weight: 6 },
        ]);
        expect(out).toEqual({
            PARCELNOS: 'P1,P2',
            ITEMS: '1,2',
            LENGTHS: '10,20',
            WIDTHS: '11,21',
            HEIGHTS: '12,22',
            WEIGHTS: '5,6',
            NUMPARCEL: '2',
        });
    });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `parcels.ts`:
```ts
type Parcel = { parcelNo: string; items: number; length: number; width: number; height: number; weight: number };

function packParcels(parcels: Parcel[]): Record<string, string> {
    const join = (pick: (p: Parcel) => number | string) => parcels.map(pick).join(',');
    return {
        PARCELNOS: join((p) => p.parcelNo),
        ITEMS: join((p) => p.items),
        LENGTHS: join((p) => p.length),
        WIDTHS: join((p) => p.width),
        HEIGHTS: join((p) => p.height),
        WEIGHTS: join((p) => p.weight),
        NUMPARCEL: String(parcels.length),
    };
}

export const nucleusParcels = { packParcels };
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Implement** `actions/create-waybill.ts` (exposes the core CreateWaybill_Inhouse fields + a parcels array; all sent as query params). Use this exact prop set:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { nucleusParcels } from '../parcels';

export const createWaybill = createAction({
    auth: nucleusAuth,
    name: 'create_waybill',
    displayName: 'Create Waybill',
    description: 'Create a live waybill with parcel dimensions in one call (CreateWaybill_Inhouse).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        dateWay: Property.ShortText({ displayName: 'Waybill Date (YYYY/MM/DD)', required: true }),
        branch: Property.ShortText({ displayName: 'Branch Code', required: true }),
        accNum: Property.ShortText({ displayName: 'Account Number', required: true }),
        servC: Property.ShortText({ displayName: 'Service Code', required: true }),
        custName: Property.ShortText({ displayName: 'Customer Name', required: true }),
        shipName: Property.ShortText({ displayName: 'Shipper Name', required: true }),
        shipTel: Property.ShortText({ displayName: 'Shipper Tel', required: false }),
        shipAddr1: Property.ShortText({ displayName: 'Shipper Address 1', required: false }),
        shipAddr2: Property.ShortText({ displayName: 'Shipper Address 2', required: false }),
        shipAddr3: Property.ShortText({ displayName: 'Shipper Address 3', required: false }),
        shipAddr4: Property.ShortText({ displayName: 'Shipper Address 4', required: false }),
        sendArea: Property.ShortText({ displayName: 'Sender Area Code', required: false }),
        consigName: Property.ShortText({ displayName: 'Consignee Name', required: true }),
        conName: Property.ShortText({ displayName: 'Consignee Contact', required: false }),
        conTel: Property.ShortText({ displayName: 'Consignee Tel', required: false }),
        conAddr1: Property.ShortText({ displayName: 'Consignee Address 1', required: false }),
        conAddr2: Property.ShortText({ displayName: 'Consignee Address 2', required: false }),
        conAddr3: Property.ShortText({ displayName: 'Consignee Address 3', required: false }),
        conAddr4: Property.ShortText({ displayName: 'Consignee Address 4', required: false }),
        destArea: Property.ShortText({ displayName: 'Destination Area Code', required: false }),
        reference: Property.ShortText({ displayName: 'Reference', required: false }),
        massKg: Property.ShortText({ displayName: 'Total Mass (kg)', required: false }),
        parcels: Property.Array({
            displayName: 'Parcels',
            required: true,
            properties: {
                parcelNo: Property.ShortText({ displayName: 'Parcel No', required: true }),
                items: Property.Number({ displayName: 'Items', required: true }),
                length: Property.Number({ displayName: 'Length', required: true }),
                width: Property.Number({ displayName: 'Width', required: true }),
                height: Property.Number({ displayName: 'Height', required: true }),
                weight: Property.Number({ displayName: 'Weight', required: true }),
            },
        }),
    },
    async run(context) {
        const p = context.propsValue;
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
        return nucleusClient.call({ auth: context.auth, store: context.store, method: HttpMethod.POST, path: 'CreateWaybill_Inhouse', query });
    },
});

function spread(key: string, value: string | undefined): Record<string, string> {
    return value === undefined || value === '' ? {} : { [key]: value };
}
```
> The `as Array<…>` on `p.parcels` is the standard pattern for `Property.Array` values (the framework types array props loosely); the sibling `jrny` `create-quote` action casts its `lines` the same way — match that. No other casts.

- [ ] **Step 6: Run all nucleus tests so far** — `cd packages/pieces/custom/nucleus && npx vitest run` → pass.
- [ ] **Step 7: Commit** `feat(nucleus): create waybill (inhouse) + parcel packing`.

## Task B4: Tracking, POD, and Label read actions

**Files:**
- Create: `src/lib/actions/get-tracking-by-accnum.ts`, `get-pod-bulk.ts`, `get-label.ts`
- Create: `packages/pieces/custom/nucleus/test/get-pod-bulk.test.ts`

- [ ] **Step 1: Write the failing test** — `test/get-pod-bulk.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';
const sendRequest = vi.fn();
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});
import { createMockActionContext } from '@activepieces/pieces-framework';
import { getPodBulk } from '../src/lib/actions/get-pod-bulk';

describe('getPodBulk', () => {
    test('GETs GetPODInformation_Bulk with waybillnumbers + GroupName and a bearer token', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: [{ Waybill: 'W1', POD: 'signed' }] });
        const ctx = createMockActionContext({
            auth: { baseUrl: 'https://api', username: 'u', password: 'p', groupName: 'G' },
            propsValue: { waybillNumbers: 'W1,W2' },
        });
        const result = await getPodBulk.run(ctx);
        const lastCall = sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
        expect(lastCall.method).toBe('GET');
        expect(lastCall.url).toBe('https://api/GetPODInformation_Bulk');
        expect(lastCall.queryParams).toEqual(expect.objectContaining({ waybillnumbers: 'W1,W2', GroupName: 'G' }));
        expect(lastCall.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer TOK' }));
        expect(result).toEqual([{ Waybill: 'W1', POD: 'signed' }]);
    });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** the three actions.

`get-pod-bulk.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getPodBulk = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk',
    displayName: 'Get PODs (Bulk)',
    description: 'Fetch proof-of-delivery info (incl. GRN) for one or more waybills.',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers (comma-separated)', required: true }),
    },
    async run(context) {
        return nucleusClient.call({
            auth: context.auth,
            store: context.store,
            method: HttpMethod.GET,
            path: 'GetPODInformation_Bulk',
            query: { waybillnumbers: context.propsValue.waybillNumbers },
        });
    },
});
```

`get-tracking-by-accnum.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getTrackingByAccnum = createAction({
    auth: nucleusAuth,
    name: 'get_tracking_by_accnum',
    displayName: 'Get Tracking by Account',
    description: 'List tracking events for an account over a date range (poll for delivered shipments).',
    props: {
        accnum: Property.ShortText({ displayName: 'Account Number', required: true }),
        dateFrom: Property.ShortText({ displayName: 'Date From (DD/MM/YYYY)', required: true }),
        dateTo: Property.ShortText({ displayName: 'Date To (DD/MM/YYYY)', required: true }),
    },
    async run(context) {
        return nucleusClient.call({
            auth: context.auth,
            store: context.store,
            method: HttpMethod.GET,
            path: 'GetTrackingByAccnum',
            query: { Accnum: context.propsValue.accnum, DateFrom: context.propsValue.dateFrom, DateTo: context.propsValue.dateTo },
        });
    },
});
```

`get-label.ts`:
```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getLabel = createAction({
    auth: nucleusAuth,
    name: 'get_label',
    displayName: 'Get Label',
    description: 'Fetch label information for a waybill (optionally a single parcel).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill', required: true }),
        parcel: Property.ShortText({ displayName: 'Parcel (optional)', required: false }),
    },
    async run(context) {
        const query: Record<string, string> = { Waybill: context.propsValue.waybill };
        if (context.propsValue.parcel) query['Parcel'] = context.propsValue.parcel;
        return nucleusClient.call({ auth: context.auth, store: context.store, method: HttpMethod.GET, path: 'GetLabel', query });
    },
});
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(nucleus): tracking, POD, and label read actions`.

## Task B5: Custom API Call + register + build

**Files:**
- Create: `src/lib/actions/custom-api-call.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement** `custom-api-call.ts` — mirror Shoprite's, but auth is the bearer token. Because the token is async + cached in the store (not available to `authMapping`, which only gets `auth`), the simplest correct approach is to fetch a token inside `authMapping` using the credentials directly:
```ts
import { createCustomApiCallAction, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const customApiCall = createCustomApiCallAction({
    auth: nucleusAuth,
    baseUrl: (auth) => (auth as { baseUrl: string }).baseUrl,
    authMapping: async (auth) => {
        const a = auth as { baseUrl: string; username: string; password: string };
        const res = await httpClient.sendRequest<{ access_token: string }>({
            method: HttpMethod.POST,
            url: nucleusClient.joinUrl(a.baseUrl, '/token'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(a.username)}&password=${encodeURIComponent(a.password)}&grant_type=password`,
        });
        return { Authorization: `Bearer ${res.body.access_token}` };
    },
});
```

- [ ] **Step 2: Register actions** in `src/index.ts`: `actions: [createWaybill, getTrackingByAccnum, getPodBulk, getLabel, customApiCall]` (import each). Keep the piece metadata from B1.
- [ ] **Step 3: Run all nucleus tests** — `cd packages/pieces/custom/nucleus && npx vitest run` → pass.
- [ ] **Step 4: Build** — `cd packages/pieces/custom/nucleus && bun run build` → `dist/` exists, no type errors.
- [ ] **Step 5: Commit** `feat(nucleus): custom API call + register actions`.

---

## Task C1: Cross-piece verification + lint + dev-registration note

- [ ] **Step 1:** `cd packages/pieces/custom/shoprite && npx vitest run` and `cd packages/pieces/custom/nucleus && npx vitest run` — all pass.
- [ ] **Step 2:** `cd packages/pieces/custom/shoprite && npx tsc -p tsconfig.lib.json --noEmit` and same for nucleus — no type errors.
- [ ] **Step 3:** `npm run lint-dev` — fix genuine lint in the two new piece dirs; revert unrelated auto-fixes; note pre-existing unrelated errors.
- [ ] **Step 4:** Confirm both pieces built (`dist/` present) so they can be loaded as dev pieces.
- [ ] **Step 5 (action item for the user, not code):** add `shoprite,nucleus` to `AP_DEV_PIECES` in `.env.dev` and restart `npm run dev` so both appear in the builder.
- [ ] **Step 6: Commit** any lint fixes: `chore(pieces): lint fixes for shoprite + nucleus`.

---

## Self-Review (completed during plan authoring)

**Spec coverage:** Shoprite connection + download_orders + acknowledge_orders + upload_invoice (configurable endpoint) + custom_api_call (A1–A5). Nucleus connection + token-caching client + create_waybill (CreateWaybill_Inhouse) + get_tracking_by_accnum + get_pod_bulk + get_label + custom_api_call (B1–B5). Both registered + built + dev-registration note (C1). The two flows from the conversation are served: orders→JRNY (download+acknowledge) and ship+invoice-on-GRN (create_waybill, get_pod_bulk/get_tracking, upload_invoice). ✓
**Deferred (Custom API Call covers them):** Shoprite claims/ASN/rebate/B2B-download; Nucleus collections, quotes, the other 3 waybill workflows, createtrack/createpod, scans, billing/SLA. Triggers (polling new_orders / delivered) are a follow-up — the flows use Schedule + these actions for V1.

**Placeholder scan:** every code step has complete code; no TBD. Two known-and-flagged casts (custom-api-call auth widening; `Property.Array` value) follow existing sibling-piece patterns. ✓

**Type consistency:** `ShopriteAuth`/`shopriteClient.{buildHeaders,joinUrl,call}` consistent A2→A5. `NucleusAuth`/`nucleusClient.{joinUrl,isExpired,getToken,call}` + `nucleusParcels.packParcels` consistent B2→B5. Action `name`s unique per piece. ✓

**Open items to confirm against live APIs during testing (not blockers to build):** Shoprite acknowledge `{action}` code (exposed as an input, default `Acknowledge`); Shoprite VendorInvoice vs B2BInvoice (connection dropdown); Nucleus `/token` GET-vs-POST (built as POST). These are validated when the user runs the actions with real credentials.
