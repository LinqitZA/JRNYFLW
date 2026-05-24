# JRNY Integration API — Full Endpoint Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all 88 JRNY Integration API endpoints as discrete, named actions in the `@jrnyflw/jrny` piece, generated from the OpenAPI spec, plus a Custom API Call — keeping the existing richer typed `create_quote` for the flagship write.

**Architecture:** A committed **operations manifest** (`operations.ts`, produced by a regenerable generator script from the saved OpenAPI JSON) drives an **action factory** (`buildJrnyAction`) that creates one `createAction` per operation: required inputs for path params (entityId auto-filled from the connection), optional/required inputs for query params, and a single `Property.Json` `body` for writes. A generic `jrnyClient.request()` performs the bearer-authed call. The piece's `actions` array = the generated actions (excluding `create_quotation`, covered by the curated `create_quote`) + `create_quote` + `custom_api_call`.

**Tech Stack:** Activepieces pieces-framework / pieces-common (`httpClient`, `HttpMethod`, `AuthenticationType`, `createCustomApiCallAction`), Vitest.

**Spec:** `docs/integrations/jrny/integration-openapi.json` (JRNY Integration API v1.0.0; 88 ops; Bearer/API-key auth `IntegrationBearerAuth`).

**Decisions (locked with user):** spec-driven full coverage; single JSON `body` for writes; keep curated `create_quote`. Action `name` = snake_case of the operationId suffix (e.g. `create_sales_order`); `displayName` = humanized suffix; `description` = the operation summary.

---

## Conventions (binding)
- Piece: `packages/pieces/custom/jrny/`. Style: match existing jrny files. No `any`, no `as` casts (guarded narrowing only; the one accepted exception is the `Property.Array` value cast already in `create-quote.ts`). Actions read connection fields via **`context.auth.props`** (CustomAuth shape). Tests live in `packages/pieces/custom/jrny/test/`, run `cd packages/pieces/custom/jrny && npx vitest run`. Mock httpClient with `vi.hoisted` + `vi.mock('@activepieces/pieces-common', …)`; inject auth as `{ props: <JrnyAuth> }` spread onto the context from `createMockActionContext`. Build with `bun run build`.
- **Base URL convention:** the spec's `path` values are full from host root (`/api/v1/integration/...`). The connection `baseUrl` is the **host root** (e.g. `http://dev.sideswipe.home:3000`); the client joins `baseUrl` + `op.path` with single-slash normalization. (Fix `create-quote.ts` to the full `/api/v1/integration/...` path to match.)

---

## Task 1: Operations manifest + generator

**Files:**
- Create: `packages/pieces/custom/jrny/tools/generate-operations.ts`
- Create: `packages/pieces/custom/jrny/src/lib/operations.ts` (generated output, committed)
- Create: `packages/pieces/custom/jrny/test/operations.test.ts`

- [ ] **Step 1: Write the generator** `tools/generate-operations.ts` — reads `docs/integrations/jrny/integration-openapi.json` (resolve from repo root), emits `src/lib/operations.ts`. For each `paths[path][method]`: `name` = snake_case(operationId after `_`); `displayName` = humanized that suffix; `description` = `.summary ?? ''`; `method` = UPPER; `path`; `tag` = `tags[0]`; `pathParams` = params where `in==='path' && name!=='entityId'` (names); `queryParams` = params where `in==='query'` → `{name, required:(required??false)}`; `hasBody` = `requestBody != null`. Emit a typed array.

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPEC = resolve(process.cwd(), 'docs/integrations/jrny/integration-openapi.json');
const OUT = resolve(process.cwd(), 'packages/pieces/custom/jrny/src/lib/operations.ts');

function snake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
}
function humanize(s: string): string {
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Param = { name: string; in: string; required?: boolean };
type Op = { name: string; displayName: string; description: string; method: string; path: string; tag: string; pathParams: string[]; queryParams: { name: string; required: boolean }[]; hasBody: boolean };

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const ops: Op[] = [];
for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
  for (const [method, opRaw] of Object.entries(item)) {
    const op = opRaw as { operationId: string; summary?: string; tags?: string[]; parameters?: Param[]; requestBody?: unknown };
    const suffix = op.operationId.includes('_') ? op.operationId.split('_').slice(1).join('_') : op.operationId;
    const params = op.parameters ?? [];
    ops.push({
      name: snake(suffix),
      displayName: humanize(suffix),
      description: op.summary ?? '',
      method: method.toUpperCase(),
      path,
      tag: op.tags?.[0] ?? 'Integration',
      pathParams: params.filter((p) => p.in === 'path' && p.name !== 'entityId').map((p) => p.name),
      queryParams: params.filter((p) => p.in === 'query').map((p) => ({ name: p.name, required: p.required ?? false })),
      hasBody: op.requestBody != null,
    });
  }
}
const banner = '// AUTO-GENERATED from docs/integrations/jrny/integration-openapi.json by tools/generate-operations.ts. Do not edit by hand.';
writeFileSync(OUT, `${banner}\nimport { JrnyOperation } from './operation-types';\n\nexport const jrnyOperations: JrnyOperation[] = ${JSON.stringify(ops, null, 2)};\n`);
console.log(`Wrote ${ops.length} operations to ${OUT}`);
```

- [ ] **Step 2: Create the operation type** `src/lib/operation-types.ts`:
```ts
export type JrnyHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

export type JrnyOperation = {
    name: string;
    displayName: string;
    description: string;
    method: JrnyHttpMethod;
    path: string;
    tag: string;
    pathParams: string[];
    queryParams: { name: string; required: boolean }[];
    hasBody: boolean;
};
```

- [ ] **Step 3: Run the generator** from repo root: `npx tsx packages/pieces/custom/jrny/tools/generate-operations.ts` (or `bunx tsx …`). Confirm `src/lib/operations.ts` is written with 88 entries. (If `tsx` unavailable, run via `bun packages/pieces/custom/jrny/tools/generate-operations.ts`.)

- [ ] **Step 4: Write the manifest test** `test/operations.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { jrnyOperations } from '../src/lib/operations';

describe('jrnyOperations manifest', () => {
    test('contains all 88 operations', () => {
        expect(jrnyOperations.length).toBe(88);
    });
    test('action names are unique', () => {
        const names = jrnyOperations.map((o) => o.name);
        expect(new Set(names).size).toBe(names.length);
    });
    test('createSalesOrder is a POST with a body and no extra path params', () => {
        const op = jrnyOperations.find((o) => o.name === 'create_sales_order');
        expect(op).toMatchObject({ method: 'POST', hasBody: true, pathParams: [], path: '/api/v1/integration/entities/{entityId}/sales-orders' });
    });
    test('getCustomer is a GET with a code path param', () => {
        const op = jrnyOperations.find((o) => o.name === 'get_customer');
        expect(op).toMatchObject({ method: 'GET', hasBody: false, pathParams: ['code'] });
    });
    test('listProducts exposes its query params', () => {
        const op = jrnyOperations.find((o) => o.name === 'list_products');
        expect(op?.queryParams.map((q) => q.name)).toEqual(expect.arrayContaining(['search', 'cursor', 'limit']));
    });
});
```

- [ ] **Step 5: Run** `cd packages/pieces/custom/jrny && npx vitest run test/operations.test.ts` → PASS (5 tests).
- [ ] **Step 6: Commit**
```bash
git add packages/pieces/custom/jrny/tools/generate-operations.ts packages/pieces/custom/jrny/src/lib/operation-types.ts packages/pieces/custom/jrny/src/lib/operations.ts packages/pieces/custom/jrny/test/operations.test.ts
git commit -m "feat(jrny): generate operations manifest from integration OpenAPI spec" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Generic client request + action factory

**Files:**
- Modify: `packages/pieces/custom/jrny/src/lib/client.ts` (add `request`)
- Create: `packages/pieces/custom/jrny/src/lib/action-factory.ts`
- Create: `packages/pieces/custom/jrny/test/action-factory.test.ts`

- [ ] **Step 1: Read** the existing `src/lib/client.ts` and `src/lib/auth.ts` (the `JrnyAuth` type: baseUrl, entityId, entityCode, bearerToken). Add a generic `request` to `jrnyClient` (keep the existing `callJrny`/error handling; reuse its error mapping). New helper:
```ts
function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

type JrnyRequest = {
    auth: JrnyAuth;
    method: HttpMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

async function request<T>({ auth, method, path, query, body }: JrnyRequest): Promise<T> {
    const response = await httpClient.sendRequest<T>({
        method,
        url: joinUrl(auth.baseUrl, path),
        authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
        headers: { 'Content-Type': 'application/json' },
        queryParams: query,
        body,
    });
    return response.body;
}
```
Export `request` (and `joinUrl`) on the `jrnyClient` object. (Confirm `AuthenticationType` import is present.)

- [ ] **Step 2: Write the failing test** `test/action-factory.test.ts`:
```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/lib/client', () => ({ jrnyClient: { request } }));

import { createMockActionContext } from '@activepieces/pieces-framework';
import { buildJrnyAction } from '../src/lib/action-factory';

const auth = { baseUrl: 'https://jrny', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'tok' };

describe('buildJrnyAction', () => {
    test('GET with a path param + query: substitutes entityId from auth, the id, and forwards set query params', async () => {
        const action = buildJrnyAction({
            name: 'get_customer', displayName: 'Get Customer', description: '', method: 'GET',
            path: '/api/v1/integration/entities/{entityId}/customers/{code}', tag: 'x',
            pathParams: ['code'], queryParams: [{ name: 'fromDate', required: false }], hasBody: false,
        });
        request.mockResolvedValue({ code: 'ACME' });
        const ctx = { ...createMockActionContext({ propsValue: { code: 'ACME', fromDate: '2026-01-01' } }), auth };
        const result = await action.run(ctx);
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            path: '/api/v1/integration/entities/ent-1/customers/ACME',
            query: { fromDate: '2026-01-01' },
        }));
        expect(result).toEqual({ code: 'ACME' });
    });

    test('POST with a body forwards the JSON body and omits empty optional query', async () => {
        const action = buildJrnyAction({
            name: 'create_sales_order', displayName: 'Create Sales Order', description: '', method: 'POST',
            path: '/api/v1/integration/entities/{entityId}/sales-orders', tag: 'x',
            pathParams: [], queryParams: [{ name: 'externalRef', required: false }], hasBody: true,
        });
        request.mockResolvedValue({ orderNumber: 'SO1' });
        const body = { customer: { code: 'ACME' }, lines: [] };
        const ctx = { ...createMockActionContext({ propsValue: { body, externalRef: '' } }), auth };
        await action.run(ctx);
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            method: 'POST',
            path: '/api/v1/integration/entities/ent-1/sales-orders',
            body,
            query: {},
        }));
    });
});
```

- [ ] **Step 3: Run, verify FAIL.**

- [ ] **Step 4: Implement** `src/lib/action-factory.ts`:
```ts
import { createAction, PieceAuthProperty, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { jrnyAuth, JrnyAuth } from './auth';
import { jrnyClient } from './client';
import { JrnyHttpMethod, JrnyOperation } from './operation-types';

const METHODS: Record<JrnyHttpMethod, HttpMethod> = {
    GET: HttpMethod.GET,
    POST: HttpMethod.POST,
    PATCH: HttpMethod.PATCH,
    DELETE: HttpMethod.DELETE,
    PUT: HttpMethod.PUT,
};

function humanizeParam(name: string): string {
    const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isJrnyAuth(value: unknown): value is JrnyAuth {
    return typeof value === 'object' && value !== null && 'entityId' in value && 'baseUrl' in value;
}

export function buildJrnyAction(op: JrnyOperation) {
    const props: Record<string, ReturnType<typeof Property.ShortText> | ReturnType<typeof Property.Json>> = {};
    for (const p of op.pathParams) {
        props[p] = Property.ShortText({ displayName: humanizeParam(p), required: true });
    }
    for (const q of op.queryParams) {
        props[q.name] = Property.ShortText({ displayName: humanizeParam(q.name), required: q.required });
    }
    if (op.hasBody) {
        props['body'] = Property.Json({ displayName: 'Body', description: 'Request body JSON (build it with the Mapper step).', required: true });
    }
    return createAction({
        auth: jrnyAuth,
        name: op.name,
        displayName: op.displayName,
        description: op.description,
        props,
        async run(context) {
            if (!isJrnyAuth(context.auth.props)) {
                throw new Error('Invalid JRNY connection');
            }
            const auth = context.auth.props;
            const values: Record<string, unknown> = context.propsValue;
            let path = op.path.replace('{entityId}', encodeURIComponent(auth.entityId));
            for (const p of op.pathParams) {
                path = path.replace(`{${p}}`, encodeURIComponent(String(values[p] ?? '')));
            }
            const query: Record<string, string> = {};
            for (const q of op.queryParams) {
                const v = values[q.name];
                if (v !== undefined && v !== '') {
                    query[q.name] = String(v);
                }
            }
            return jrnyClient.request({
                auth,
                method: METHODS[op.method],
                path,
                query,
                body: op.hasBody ? values['body'] : undefined,
            });
        },
    });
}
```
> Note: `auth` is the param `jrnyAuth`; `context.auth.props` carries `JrnyAuth`. The `isJrnyAuth` guard avoids a cast. `values: Record<string, unknown> = context.propsValue` is an assignment (not a cast); if TS objects, type via `const values = context.propsValue as Record<string, unknown>` is NOT allowed — instead read each with `context.propsValue[key]` directly, which is already `unknown` for dynamic props. Adjust to whatever compiles cast-free. `PieceAuthProperty` import only if needed for typing the props record; drop if unused.

- [ ] **Step 5: Run, verify PASS** (2 tests).
- [ ] **Step 6: Commit**
```bash
git add packages/pieces/custom/jrny/src/lib/client.ts packages/pieces/custom/jrny/src/lib/action-factory.ts packages/pieces/custom/jrny/test/action-factory.test.ts
git commit -m "feat(jrny): generic request + spec-driven action factory" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Custom API Call + wire all actions + fix create_quote + build

**Files:**
- Create: `packages/pieces/custom/jrny/src/lib/actions/custom-api-call.ts` (if not present)
- Modify: `packages/pieces/custom/jrny/src/lib/actions/create-quote.ts` (path fix)
- Modify: `packages/pieces/custom/jrny/src/index.ts`

- [ ] **Step 1: custom-api-call.ts** — mirror the pattern in `packages/pieces/custom/shoprite/src/lib/actions/custom-api-call.ts` (read it). Bearer auth from `auth.props.bearerToken`; baseUrl from `auth.props.baseUrl`:
```ts
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { jrnyAuth } from '../auth';

export const customApiCall = createCustomApiCallAction({
    auth: jrnyAuth,
    baseUrl: (auth) => auth?.props.baseUrl ?? '',
    authMapping: async (auth) => ({ Authorization: `Bearer ${auth.props.bearerToken}` }),
});
```

- [ ] **Step 2: Fix create-quote path** — in `create-quote.ts`, change its request path from `/v1/integration/...` to the full `/api/v1/integration/entities/${...entityId}/quotations` so it matches the new base-URL convention (host-root `baseUrl`). Confirm it reads `context.auth.props`. Update the `jrnyAuth` description in `auth.ts` so the Base URL field says the **host root** (e.g. `http://dev.sideswipe.home:3000`), not `.../api`.

- [ ] **Step 3: Wire index.ts**:
```ts
import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { jrnyAuth } from './lib/auth';
import { jrnyOperations } from './lib/operations';
import { buildJrnyAction } from './lib/action-factory';
import { createQuote } from './lib/actions/create-quote';
import { customApiCall } from './lib/actions/custom-api-call';

const generatedActions = jrnyOperations
    .filter((op) => op.name !== 'create_quotation')
    .map(buildJrnyAction);

export const jrny = createPiece({
    displayName: 'JRNY',
    description: 'JRNY ERP integration — full Integration API coverage (sales, customers, products, procurement, finance, pricing, shipping, admin).',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM, PieceCategory.ACCOUNTING],
    auth: jrnyAuth,
    actions: [createQuote, ...generatedActions, customApiCall],
    triggers: [],
});
```
(Preserve the existing piece metadata/logo/categories from the current index.ts; only change the `actions` wiring + description.)

- [ ] **Step 4: Run all jrny tests** — `cd packages/pieces/custom/jrny && npx vitest run` → pass (operations + factory + any existing create-quote test).
- [ ] **Step 5: BUILD** — `cd packages/pieces/custom/jrny && bun run build` → succeeds, `dist/src/index.js` exists, no type errors. (This is the critical gate — confirms the factory + 88 generated actions + custom-api-call all typecheck.)
- [ ] **Step 6: Sanity-count actions** — `node -e "const {jrny}=require('./packages/pieces/custom/jrny/dist/src/index.js'); console.log(Object.keys(jrny.actions).length)"` → expect 89 (87 generated [88 minus create_quotation] + create_quote + custom_api_call). Report the count.
- [ ] **Step 7: Commit**
```bash
git add packages/pieces/custom/jrny/src
git commit -m "feat(jrny): wire all 88 integration endpoints + custom API call" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Verify + lint

- [ ] **Step 1:** `cd packages/pieces/custom/jrny && npx vitest run` — all pass.
- [ ] **Step 2:** `cd packages/pieces/custom/jrny && npx tsc -p tsconfig.lib.json --noEmit` — 0 errors.
- [ ] **Step 3:** `npm run lint-dev` — fix genuine lint in the jrny dir; revert unrelated auto-fixes; note pre-existing unrelated errors.
- [ ] **Step 4:** Confirm `packages/pieces/custom/jrny/dist` present (already in AP_DEV_PIECES, so it'll reload on restart).
- [ ] **Step 5: Commit** any lint fixes: `chore(jrny): lint fixes`.

---

## Self-Review (completed during plan authoring)
**Spec coverage:** all 88 ops → generated actions (T1 manifest, T2 factory, T3 wiring), minus `create_quotation` which the curated `create_quote` covers; + custom_api_call for anything else. ✓ Path params (excl entityId), query params, JSON body for the 19 writes — all from the spec. ✓ Bearer auth via the existing connection. ✓
**Placeholder scan:** real code in every step; the generator emits the manifest; factory is complete. The cast-avoidance note in T2 step 4 is guidance, not a placeholder. ✓
**Type consistency:** `JrnyOperation`/`JrnyHttpMethod` (T1) used by factory (T2) + index (T3). `jrnyClient.request` (T2) called by factory. `buildJrnyAction` (T2) used in index (T3). `context.auth.props` everywhere. ✓
**Risk/eyeball:** base-URL convention changed to host-root — `create_quote` path fixed to match; the connection's Base URL field description updated. Live calls validate against the real JRNY instance (`http://dev.sideswipe.home:3000`). Admin endpoints (keys/webhooks/activity) are included as actions too — harmless; they require an admin-scoped key.
