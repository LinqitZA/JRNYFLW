# Shoprite invoices flow (phase 2) and orders switch-over: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two importable flows for the move off the old platform: Shoprite invoices sent from JRNY every hour, and a live Shoprite orders flow that acknowledges what is safely in JRNY.

**Architecture:**
- A pure `invoiceReadiness` module in the JRNY piece decides, from JRNY's own data, whether an invoice is ready, waiting, or ready with a problem.
- Two hand-written JRNY actions wrap the HTTP: **List Invoices Ready to Send** (list, detail, dispatch POD check, 429 back-off) and **Record Invoice Result** (api-delivery).
- Two generators write the flow JSON:
  - a new invoices generator;
  - the orders generator, which gains an `--acknowledge` switch-over variant.

**Tech Stack:** TypeScript, Activepieces pieces framework, vitest, `tsx` for generators.

**Spec:** `docs/superpowers/specs/2026-10-17-shoprite-invoices-design.md` (sections "Piece work: JRNY", "The flow", "GTINs", "JRNY's invoice endpoints"). For the orders flow: `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md` ("Before and after the switch-over").

## Global Constraints

- Only `gtinSource: "gtin"` counts as a GTIN. A `default` barcode is never sent to Shoprite.
- "Delivered" means every dispatch note of the invoice's sales order has `podSignedAt` or `podUrl`. `shipping.delivered` is never treated as delivery.
- A failed invoice whose JRNY `apiDelivery.lastMessage` starts `UNCONFIRMED` is never resent automatically.
- `occurredAt` is sent as `new Date().toISOString()` (ends in `Z`). `message` ≤ 2,000 characters, `externalReference` ≤ 255.
- The orders flow acknowledges an order only when it is in JRNY: already loaded, created now, or refused as `DUPLICATE_PORTAL_ORDER`.
- Committed fixtures use made-up invoice numbers, GLNs, GTINs and amounts with valid check digits. No JRNY dev (production copy) data goes in the repo.
- Exported types and constants go at the end of the file. Util files export one object. Functions with more than one parameter take one destructured object. No `any`, no `as` casts.
- Flow JSON connections stay placeholders: `{{connections['pick-the-…-connection']}}`.
- Never call Acknowledge Orders or Send Invoice against Shoprite from tests or scripts.

## Review Focus

1. **Send Invoice fails in the engine before it runs** (no `ok`, no `error`), so the failed branch has a blank code and message. JRNY rejects `failed` without a message. Record Invoice Result must still record a message (Task 3 test).
2. **JRNY answers 429 mid-run.** The ready list must back off and carry on, not fail the run (Task 2 test).
3. **Problem invoices outnumber Max Invoices.** Invoices with a missing GTIN or GLN must not crowd out clean ones forever: only clean invoices count toward the cap (Task 2 test).
4. **An invoice whose sales order has two dispatches, one without a POD** is still waiting (Task 1 test).
5. **A `lineTotal + vatAmount` float sum** such as 0.1 + 0.2 must come out to whole cents, or Send Invoice's VAT check refuses it (Task 1 test).

---

### Task 1: invoiceReadiness (pure rules)

**Files:**
- Create: `packages/pieces/custom/jrny/src/lib/invoice-readiness.ts`
- Test: `packages/pieces/custom/jrny/test/invoice-readiness.test.ts`

**Interfaces:**
- Produces:
  - `invoiceReadiness.screen(row: unknown): SkipReason | null`, where `SkipReason = 'noPurchaseOrder' | 'unconfirmed'`;
  - `invoiceReadiness.assess({ detail, dispatches }: { detail: unknown; dispatches: unknown[] }): Assessment`.
- Types:
  - `Assessment = { kind: 'waiting'; reason: WaitReason } | { kind: 'ready'; invoice: ReadyInvoice }`
  - `WaitReason = 'noSalesOrder' | 'noDispatch' | 'notDelivered'`
  - `ReadyInvoice = { invoiceNumber, invoiceDate, purchaseOrder, storeGln: string | null, deliveryAddressCode: string | null, totalExclVat, totalVat, totalInclVat, lines: ReadyLine[], clean: boolean, problem: string | null }`
  - `ReadyLine = { lineNumber: number | string, quantity, lineTotalExclVat, lineTotalInclVat, description, gtin: string | null, productCode: string | null, uom: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { invoiceReadiness } from '../src/lib/invoice-readiness';

const line = (over: Record<string, unknown> = {}) => ({
    lineNumber: '1', productCode: 'TRI100', description: 'Test item', quantity: 12, uom: 'EACH', unitPrice: 10,
    vatRate: 15, lineTotal: 120, vatAmount: 18, taxCode: 'S', gtin: '06001234567892', gtinSource: 'gtin', ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
    invoiceNumber: 'INV-1001', invoiceDate: '2026-10-20', customerPoNumber: ' 1221181491 ', salesOrderNumber: 'SO-1',
    subtotal: 120, vatTotal: 18, total: 138, deliveryAddress: { code: '1608', gln: '6001234567899' }, lines: [line()], ...over,
});
const delivered = { dispatchNumber: 'DN-1', podSignedAt: '2026-10-21T09:00:00Z', podUrl: null };

describe('invoiceReadiness.screen', () => {
    test('passes an unsent invoice with a PO', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: null })).toBeNull();
    });
    test('skips an invoice with no PO', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: '  ', apiDelivery: null })).toBe('noPurchaseOrder');
    });
    test('skips a failed invoice recorded as UNCONFIRMED', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'failed', lastMessage: 'UNCONFIRMED: no answer' } })).toBe('unconfirmed');
    });
    test('passes a failed invoice with any other reason, and a reset one', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'failed', lastMessage: 'REJECTED: bad' } })).toBeNull();
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'reset', lastMessage: 'UNCONFIRMED: old' } })).toBeNull();
    });
});

describe('invoiceReadiness.assess', () => {
    test('a delivered invoice with GTINs and a GLN is clean, in Send Invoice shape', () => {
        const result = invoiceReadiness.assess({ detail: detail(), dispatches: [delivered] });
        expect(result).toEqual({
            kind: 'ready',
            invoice: {
                invoiceNumber: 'INV-1001', invoiceDate: '2026-10-20', purchaseOrder: '1221181491', storeGln: '6001234567899', deliveryAddressCode: '1608',
                totalExclVat: 120, totalVat: 18, totalInclVat: 138, clean: true, problem: null,
                lines: [{ lineNumber: 1, quantity: 12, lineTotalExclVat: 120, lineTotalInclVat: 138, description: 'Test item', gtin: '06001234567892', productCode: 'TRI100', uom: 'EACH' }],
            },
        });
    });
    test('waits when there is no sales order, no dispatch, or a dispatch without a POD', () => {
        expect(invoiceReadiness.assess({ detail: detail({ salesOrderNumber: null }), dispatches: [] })).toEqual({ kind: 'waiting', reason: 'noSalesOrder' });
        expect(invoiceReadiness.assess({ detail: detail(), dispatches: [] })).toEqual({ kind: 'waiting', reason: 'noDispatch' });
        expect(invoiceReadiness.assess({ detail: detail(), dispatches: [delivered, { dispatchNumber: 'DN-2', podSignedAt: null, podUrl: null }] })).toEqual({ kind: 'waiting', reason: 'notDelivered' });
    });
    test('a POD link alone counts as delivered', () => {
        const result = invoiceReadiness.assess({ detail: detail(), dispatches: [{ podSignedAt: null, podUrl: 'https://pod/1' }] });
        expect(result.kind).toBe('ready');
    });
    test('a default barcode is never passed on, and the problem names product and unit', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line(), line({ lineNumber: '2', productCode: 'TRI200', uom: 'BOX', gtin: '12345670', gtinSource: 'default' })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ kind: 'ready', invoice: { clean: false, problem: 'Line 2 (TRI200, BOX): no Shoprite GTIN in JRNY' } });
        if (result.kind === 'ready') expect(result.invoice.lines[1].gtin).toBeNull();
    });
    test('a missing GLN is a problem naming the address code, joined with the line problems', () => {
        const result = invoiceReadiness.assess({ detail: detail({ deliveryAddress: { code: '1608', gln: null }, lines: [line({ gtin: null, gtinSource: null })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ kind: 'ready', invoice: { clean: false, storeGln: null, problem: 'Delivery address 1608 has no GLN in JRNY; Line 1 (TRI100, EACH): no Shoprite GTIN in JRNY' } });
    });
    test('no delivery address at all is a problem', () => {
        const result = invoiceReadiness.assess({ detail: detail({ deliveryAddress: null }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { problem: 'The invoice has no delivery address in JRNY' } });
    });
    test('line incl. VAT is rounded to whole cents', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line({ lineTotal: 0.1, vatAmount: 0.2 })] }), dispatches: [delivered] });
        if (result.kind === 'ready') expect(result.invoice.lines[0].lineTotalInclVat).toBe(0.3);
    });
    test('a date-time invoice date is cut to the date', () => {
        const result = invoiceReadiness.assess({ detail: detail({ invoiceDate: '2026-10-20T00:00:00.000Z' }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { invoiceDate: '2026-10-20' } });
    });
    test('a line number that is not a whole number is kept as text and named as a problem', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line({ lineNumber: '1a' })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { clean: false, problem: 'Line 1a: the line number is not a whole number', lines: [{ lineNumber: '1a' }] } });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/pieces/custom/jrny && npx vitest run test/invoice-readiness.test.ts`
Expected: FAIL, "Failed to resolve import ../src/lib/invoice-readiness".

- [ ] **Step 3: Write the implementation**

```ts
function screen(row: unknown): SkipReason | null {
    const record = asRecord(row);
    if (textOf(record['customerPoNumber']) === null) {
        return 'noPurchaseOrder';
    }
    const delivery = asRecord(record['apiDelivery']);
    // An UNCONFIRMED invoice may already be in Shoprite; a person checks and resets it, and a reset invoice comes back unsent.
    if (delivery['status'] === 'failed' && (textOf(delivery['lastMessage']) ?? '').startsWith('UNCONFIRMED')) {
        return 'unconfirmed';
    }
    return null;
}

function assess({ detail, dispatches }: { detail: unknown; dispatches: unknown[] }): Assessment {
    const invoice = asRecord(detail);
    if (textOf(invoice['salesOrderNumber']) === null) {
        return { kind: 'waiting', reason: 'noSalesOrder' };
    }
    if (dispatches.length === 0) {
        return { kind: 'waiting', reason: 'noDispatch' };
    }
    // JRNY's shipping.delivered fires when the invoice is raised, so only the courier's POD proves delivery.
    if (!dispatches.every((dispatch) => hasPod(asRecord(dispatch)))) {
        return { kind: 'waiting', reason: 'notDelivered' };
    }
    const problems: string[] = [];
    const address = invoice['deliveryAddress'];
    const addressCode = isRecord(address) ? textOf(address['code']) : null;
    const storeGln = isRecord(address) ? textOf(address['gln']) : null;
    if (!isRecord(address)) {
        problems.push('The invoice has no delivery address in JRNY');
    } else if (storeGln === null) {
        problems.push(`Delivery address ${addressCode ?? '(no code)'} has no GLN in JRNY`);
    }
    const lines = (Array.isArray(invoice['lines']) ? invoice['lines'] : []).map((raw) => readyLine({ raw: asRecord(raw), problems }));
    const problem = problems.length === 0 ? null : problems.join('; ');
    return {
        kind: 'ready',
        invoice: {
            invoiceNumber: textOf(invoice['invoiceNumber']) ?? '',
            invoiceDate: (textOf(invoice['invoiceDate']) ?? '').slice(0, 10),
            purchaseOrder: textOf(invoice['customerPoNumber']) ?? '',
            storeGln,
            deliveryAddressCode: addressCode,
            totalExclVat: numberOf(invoice['subtotal']),
            totalVat: numberOf(invoice['vatTotal']),
            totalInclVat: numberOf(invoice['total']),
            lines,
            clean: problem === null,
            problem,
        },
    };
}

function readyLine({ raw, problems }: { raw: Record<string, unknown>; problems: string[] }): ReadyLine {
    const lineText = textOf(raw['lineNumber']) ?? '?';
    const lineNumber = /^\d+$/.test(lineText) ? Number(lineText) : lineText;
    if (typeof lineNumber === 'string') {
        problems.push(`Line ${lineText}: the line number is not a whole number`);
    }
    const productCode = textOf(raw['productCode']);
    const uom = textOf(raw['uom']);
    // A default barcode is JRNY's fallback, not the GTIN Shoprite orders against, so it must never reach Shoprite.
    const gtin = raw['gtinSource'] === 'gtin' ? textOf(raw['gtin']) : null;
    if (gtin === null) {
        problems.push(`Line ${lineText} (${productCode ?? 'no product'}, ${uom ?? 'no unit'}): no Shoprite GTIN in JRNY`);
    }
    const exclVat = numberOf(raw['lineTotal']);
    return {
        lineNumber,
        quantity: numberOf(raw['quantity']),
        lineTotalExclVat: exclVat,
        lineTotalInclVat: Math.round((exclVat + numberOf(raw['vatAmount'])) * 100) / 100,
        description: textOf(raw['description']) ?? '',
        gtin,
        productCode,
        uom,
    };
}

function hasPod(dispatch: Record<string, unknown>): boolean {
    return textOf(dispatch['podSignedAt']) !== null || textOf(dispatch['podUrl']) !== null;
}

function textOf(value: unknown): string | null {
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text === '' ? null : text;
}

// JRNY documents amounts as numeric strings but sends numbers; both are read.
function numberOf(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

export const invoiceReadiness = { screen, assess };

export type SkipReason = 'noPurchaseOrder' | 'unconfirmed';
export type WaitReason = 'noSalesOrder' | 'noDispatch' | 'notDelivered';
export type ReadyLine = {
    lineNumber: number | string;
    quantity: number;
    lineTotalExclVat: number;
    lineTotalInclVat: number;
    description: string;
    gtin: string | null;
    productCode: string | null;
    uom: string | null;
};
export type ReadyInvoice = {
    invoiceNumber: string;
    invoiceDate: string;
    purchaseOrder: string;
    storeGln: string | null;
    deliveryAddressCode: string | null;
    totalExclVat: number;
    totalVat: number;
    totalInclVat: number;
    lines: ReadyLine[];
    clean: boolean;
    problem: string | null;
};
export type Assessment = { kind: 'waiting'; reason: WaitReason } | { kind: 'ready'; invoice: ReadyInvoice };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/pieces/custom/jrny && npx vitest run test/invoice-readiness.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/jrny/src/lib/invoice-readiness.ts packages/pieces/custom/jrny/test/invoice-readiness.test.ts
git commit -m "feat(jrny): invoice readiness rules for Shoprite: PO, UNCONFIRMED, POD, confirmed GTIN only, GLN"
```

### Task 2: List Invoices Ready to Send action

**Files:**
- Create: `packages/pieces/custom/jrny/src/lib/actions/list-invoices-ready.ts`
- Modify: `packages/pieces/custom/jrny/src/index.ts` (register the action)
- Modify: `docs/integrations/jrny/integration-openapi.json` (refresh from JRNY dev: `productCode` on finance lines; `operations.ts` does not change)
- Test: `packages/pieces/custom/jrny/test/list-invoices-ready.test.ts`

**Interfaces:**
- Consumes: `invoiceReadiness.screen`, `invoiceReadiness.assess`, `ReadyInvoice` (Task 1); `jrnyClient.request`, `JrnyApiError` (client.ts).
- Produces: action `list_invoices_ready_to_send`, with props `customerCode`, `fromDate`, `maxInvoices`, `onFailure`. It outputs `{ count: number, invoices: ReadyInvoice[], clean: number, withProblems: number, waiting: { noPurchaseOrder, unconfirmed, noSalesOrder, noDispatch, notDelivered, overLimit } }`.

**Behaviour:**
- `customerCode` (required, trimmed). `fromDate` is required, YYYY-MM-DD: the switch-over date, because invoices before it were sent by the old platform.
- `maxInvoices` defaults to 50. It is a Number; blank or below 1 means 50.
- Lists `apiDelivery=unsent`, then `apiDelivery=failed`, each with `customerCode`, `fromDate` and `limit=200`, following `cursor` while `hasMore`, over at most 50 pages per status.
- For each row it calls `screen`. A skip adds to `waiting`; otherwise it gets the detail at `GET …/invoices/{n}`.
- If the detail has a `salesOrderNumber`, it calls `GET …/dispatch-notes?salesOrderNumber=…&limit=50`.
- It then calls `assess`. A clean invoice beyond `maxInvoices` is counted in `waiting.overLimit` and not listed. Invoices with a problem are always listed.
- Every JRNY call goes through `withBackoff`: on `JrnyApiError` with `httpStatus === 429`, it waits 2, 4, 8 and 16 s and tries again, then gives up and throws.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { listInvoicesReady } from '../src/lib/actions/list-invoices-ready';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };
const BASE = 'https://jrny/api/v1/integration/entities/ent-1';

const row = (n: string, over: Record<string, unknown> = {}) => ({ invoiceNumber: n, customerPoNumber: 'PO-' + n, apiDelivery: null, ...over });
const detail = (n: string, over: Record<string, unknown> = {}) => ({
    invoiceNumber: n, invoiceDate: '2026-10-20', customerPoNumber: 'PO-' + n, salesOrderNumber: 'SO-' + n,
    subtotal: 100, vatTotal: 15, total: 115, deliveryAddress: { code: '1608', gln: '6001234567899' },
    lines: [{ lineNumber: '1', productCode: 'TRI100', description: 'Item', quantity: 1, uom: 'EACH', lineTotal: 100, vatAmount: 15, gtin: '06001234567892', gtinSource: 'gtin' }],
    ...over,
});
const pod = { data: [{ dispatchNumber: 'DN-1', podSignedAt: '2026-10-21T09:00:00Z' }], cursor: null, hasMore: false };
const noPod = { data: [{ dispatchNumber: 'DN-1', podSignedAt: null, podUrl: null }], cursor: null, hasMore: false };
const list = (data: unknown[], cursor: string | null = null) => ({ data, cursor, hasMore: cursor !== null });

// Answers by URL so the test does not depend on call order.
function jrny(routes: Record<string, unknown>) {
    sendRequest.mockImplementation(async (req: { url: string; queryParams?: Record<string, string> }) => {
        const key = req.url.replace(BASE, '') + (req.queryParams?.['apiDelivery'] ? `?${req.queryParams['apiDelivery']}${req.queryParams['cursor'] ? '&' + req.queryParams['cursor'] : ''}` : '') + (req.queryParams?.['salesOrderNumber'] ? `?so=${req.queryParams['salesOrderNumber']}` : '');
        if (!(key in routes)) throw new Error('unexpected call ' + key);
        return { status: 200, body: routes[key] };
    });
}

function run(propsValue: Record<string, unknown>) {
    return listInvoicesReady.run({ ...createMockActionContext({ propsValue: { customerCode: 'SHOE100', fromDate: '2026-10-20', ...propsValue } }), auth });
}

describe('listInvoicesReady', () => {
    beforeEach(() => sendRequest.mockReset());
    afterEach(() => vi.useRealTimers());

    test('lists unsent and failed, pages through, and returns delivered invoices in Send Invoice shape', async () => {
        jrny({
            '/invoices?unsent': list([row('INV-1')], 'c1'),
            '/invoices?unsent&c1': list([row('INV-2')]),
            '/invoices?failed': list([row('INV-3', { apiDelivery: { status: 'failed', lastMessage: 'REJECTED: x' } })]),
            '/invoices/INV-1': detail('INV-1'), '/invoices/INV-2': detail('INV-2'), '/invoices/INV-3': detail('INV-3'),
            '/dispatch-notes?so=SO-INV-1': pod, '/dispatch-notes?so=SO-INV-2': noPod, '/dispatch-notes?so=SO-INV-3': pod,
        });
        const result = await run({});
        expect(result).toMatchObject({ ok: true, output: { count: 2, clean: 2, withProblems: 0, waiting: { notDelivered: 1 } } });
        expect(result.output.invoices.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual(['INV-1', 'INV-3']);
        expect(result.output.invoices[0]).toMatchObject({ purchaseOrder: 'PO-INV-1', storeGln: '6001234567899', lines: [{ lineNumber: 1, gtin: '06001234567892', lineTotalInclVat: 115 }] });
        const listCall = sendRequest.mock.calls.find((c) => c[0].url === BASE + '/invoices');
        expect(listCall?.[0].queryParams).toEqual({ customerCode: 'SHOE100', apiDelivery: 'unsent', fromDate: '2026-10-20', limit: '200' });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('skips no-PO and UNCONFIRMED rows without fetching them', async () => {
        jrny({
            '/invoices?unsent': list([row('INV-1', { customerPoNumber: null })]),
            '/invoices?failed': list([row('INV-2', { apiDelivery: { status: 'failed', lastMessage: 'UNCONFIRMED: no answer' } })]),
        });
        const result = await run({});
        expect(result.output).toMatchObject({ count: 0, waiting: { noPurchaseOrder: 1, unconfirmed: 1 } });
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    test('only clean invoices count toward Max Invoices; problem ones are always listed', async () => {
        jrny({
            '/invoices?unsent': list([row('INV-1'), row('INV-2'), row('INV-3')]),
            '/invoices?failed': list([]),
            '/invoices/INV-1': detail('INV-1', { deliveryAddress: { code: '1608', gln: null } }), '/invoices/INV-2': detail('INV-2'), '/invoices/INV-3': detail('INV-3'),
            '/dispatch-notes?so=SO-INV-1': pod, '/dispatch-notes?so=SO-INV-2': pod, '/dispatch-notes?so=SO-INV-3': pod,
        });
        const result = await run({ maxInvoices: 1 });
        expect(result.output).toMatchObject({ count: 2, clean: 1, withProblems: 1, waiting: { overLimit: 1 } });
        expect(result.output.invoices[0]).toMatchObject({ invoiceNumber: 'INV-1', clean: false, problem: 'Delivery address 1608 has no GLN in JRNY' });
    });

    test('backs off on a 429 and carries on', async () => {
        vi.useFakeTimers();
        let first = true;
        sendRequest.mockImplementation(async (req: { url: string; queryParams?: Record<string, string> }) => {
            if (first) {
                first = false;
                throw new HttpError({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' } }, { response: { status: 429, body: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' } } } } as never);
            }
            return { status: 200, body: list([]) };
        });
        const pending = run({});
        await vi.advanceTimersByTimeAsync(2000);
        const result = await pending;
        expect(result).toMatchObject({ ok: true, output: { count: 0 } });
        expect(sendRequest).toHaveBeenCalledTimes(3);
    });

    test.each([
        [{ fromDate: '' }, 'From Date is required: the switch-over date, YYYY-MM-DD. Invoices before it were sent by the old platform.'],
        [{ fromDate: '20/10/2026' }, 'From Date must be YYYY-MM-DD, e.g. 2026-10-20'],
        [{ customerCode: ' ' }, 'Customer Code is required'],
    ])('rejects %j before calling JRNY', async (props, message) => {
        const result = await run({ ...props, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message } });
        expect(sendRequest).not.toHaveBeenCalled();
    });
});
```

Note: the `HttpError` construction in the 429 test must match `@activepieces/pieces-common`'s constructor. Check `packages/pieces/common/src/lib/http/core/http-error.ts` and build it the way `client.ts`'s callers see it (`err.response.status`, `err.response.body`). If it needs an axios-shaped error, build that object literally. `as never` is a test-only escape and must not appear in `src/`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/pieces/custom/jrny && npx vitest run test/list-invoices-ready.test.ts`
Expected: FAIL, "Failed to resolve import ../src/lib/actions/list-invoices-ready".

- [ ] **Step 3: Write the implementation**

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { jrnyAuth, JrnyAuth } from '../auth';
import { JrnyApiError, jrnyClient } from '../client';
import { invoiceReadiness, ReadyInvoice } from '../invoice-readiness';

export const listInvoicesReady = createAction({
  auth: jrnyAuth,
  name: 'list_invoices_ready_to_send',
  displayName: 'List Invoices Ready to Send',
  description:
    "A customer's invoices that are delivered (POD on every dispatch) and not yet sent, oldest first, with their lines in Send Invoice's shape. Invoices missing a GTIN or GLN come back with clean false and a problem to record.",
  props: {
    customerCode: Property.ShortText({ displayName: 'Customer Code', description: 'e.g. SHOE100', required: true }),
    fromDate: Property.ShortText({
      displayName: 'From Date',
      description: 'The switch-over date, YYYY-MM-DD. Invoices before it were sent by the old platform and are never sent again.',
      required: true,
    }),
    maxInvoices: Property.Number({
      displayName: 'Max Invoices',
      description: 'Most clean invoices per run (default 50). Invoices with a problem are always listed.',
      required: false,
      defaultValue: DEFAULT_MAX,
    }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const customerCode = (p.customerCode ?? '').trim();
        const fromDate = (p.fromDate ?? '').trim();
        if (customerCode === '') throw new Error('Customer Code is required');
        if (fromDate === '') throw new Error('From Date is required: the switch-over date, YYYY-MM-DD. Invoices before it were sent by the old platform.');
        if (!ISO_DATE.test(fromDate)) throw new Error('From Date must be YYYY-MM-DD, e.g. 2026-10-20');
        const maxInvoices = typeof p.maxInvoices === 'number' && p.maxInvoices >= 1 ? Math.floor(p.maxInvoices) : DEFAULT_MAX;
        const entity = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}`;
        const waiting = { noPurchaseOrder: 0, unconfirmed: 0, noSalesOrder: 0, noDispatch: 0, notDelivered: 0, overLimit: 0 };
        const invoices: ReadyInvoice[] = [];
        let clean = 0;
        for (const apiDelivery of ['unsent', 'failed']) {
          const rows = await listAll({ trace, auth, path: `${entity}/invoices`, query: { customerCode, apiDelivery, fromDate } });
          for (const row of rows) {
            const skip = invoiceReadiness.screen(row);
            if (skip !== null) {
              waiting[skip] += 1;
              continue;
            }
            const invoiceNumber = String(row['invoiceNumber']);
            const detail = await withBackoff(() => jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.GET, path: `${entity}/invoices/${encodeURIComponent(invoiceNumber)}` }));
            const salesOrderNumber = isRecord(detail) && typeof detail['salesOrderNumber'] === 'string' ? detail['salesOrderNumber'].trim() : '';
            const dispatches = salesOrderNumber === '' ? [] : await listAll({ trace, auth, path: `${entity}/dispatch-notes`, query: { salesOrderNumber } });
            const assessment = invoiceReadiness.assess({ detail, dispatches });
            if (assessment.kind === 'waiting') {
              waiting[assessment.reason] += 1;
              continue;
            }
            if (assessment.invoice.clean) {
              if (clean >= maxInvoices) {
                waiting.overLimit += 1;
                continue;
              }
              clean += 1;
            }
            invoices.push(assessment.invoice);
          }
        }
        return { count: invoices.length, invoices, clean, withProblems: invoices.length - clean, waiting };
      },
    });
  },
});

async function listAll({ trace, auth, path, query }: { trace: Tracer; auth: JrnyAuth; path: string; query: Record<string, string> }): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 1; ; pageNumber++) {
    if (pageNumber > MAX_PAGES) {
      throw new Error(`More than ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en-US')} records match ${path}; set a later From Date`);
    }
    const pageQuery: Record<string, string> = { ...query, limit: String(PAGE_SIZE), ...(cursor === null ? {} : { cursor }) };
    const page: unknown = await withBackoff(() => jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.GET, path, query: pageQuery }));
    if (!isPage(page) || (page.hasMore && !page.cursor)) {
      throw new Error('Unexpected response from JRNY');
    }
    rows.push(...page.data);
    if (!page.hasMore) return rows;
    cursor = page.cursor;
  }
}

// JRNY rate-limits bursts; one invoice costs two or three calls, so a run of any size meets a 429 sooner or later.
async function withBackoff<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof JrnyApiError) || err.httpStatus !== 429 || attempt >= BACKOFF_SECONDS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_SECONDS[attempt] * 1000));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPage(value: unknown): value is { data: Record<string, unknown>[]; cursor: string | null; hasMore: boolean } {
  if (!isRecord(value) || !Array.isArray(value['data']) || typeof value['hasMore'] !== 'boolean') return false;
  const cursor = value['cursor'] ?? null;
  return value['data'].every(isRecord) && (cursor === null || typeof cursor === 'string');
}

const DEFAULT_MAX = 50;
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const BACKOFF_SECONDS = [2, 4, 8, 16];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
```

If a non-envelope 429 (a plain `Error` from `toJrnyError`) shows up in practice, extend `withBackoff`. JRNY's documented 429 carries the `RATE_LIMIT_EXCEEDED` envelope, so `JrnyApiError` covers it.

Register it in `src/index.ts`: import `listInvoicesReady` and add it after `generatePick` in `actions`.

Refresh the API description:

```bash
curl -s http://localhost:3001/api/integration/docs-json | python3 -c "import json,sys;json.dump(json.load(sys.stdin),open('docs/integrations/jrny/integration-openapi.json','w'),separators=(',',':'))"
npx tsx packages/pieces/custom/jrny/tools/generate-operations.ts
git diff --stat packages/pieces/custom/jrny/src/lib/operations.ts   # Expected: no change
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/jrny && npx vitest run`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/jrny docs/integrations/jrny/integration-openapi.json
git commit -m "feat(jrny): List Invoices Ready to Send: unsent and failed, POD-gated, Send Invoice shape, 429 back-off"
```

### Task 3: Record Invoice Result action

**Files:**
- Create: `packages/pieces/custom/jrny/src/lib/actions/record-invoice-result.ts`
- Modify: `packages/pieces/custom/jrny/src/index.ts`
- Test: `packages/pieces/custom/jrny/test/record-invoice-result.test.ts`

**Interfaces:**
- Produces: action `record_invoice_result`, with props `invoiceNumber`, `status` (`sent` | `failed`), `externalReference`, `errorCode`, `message`, `onFailure`. It outputs JRNY's `data` (`{ documentType, documentNumber, changed, apiDelivery }`).

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { recordInvoiceResult } from '../src/lib/actions/record-invoice-result';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };
const URL = 'https://jrny/api/v1/integration/entities/ent-1/invoices/INV%2F1/api-delivery';

function run(propsValue: Record<string, unknown>) {
    return recordInvoiceResult.run({ ...createMockActionContext({ propsValue: { invoiceNumber: 'INV/1', ...propsValue } }), auth });
}
const sent = () => sendRequest.mock.calls[0][0];

describe('recordInvoiceResult', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        sendRequest.mockResolvedValue({ status: 200, body: { data: { documentNumber: 'INV/1', changed: true } } });
    });

    test('records sent with the reference, a Z time and a per-run idempotency key', async () => {
        const result = await run({ status: 'sent', externalReference: 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9' });
        expect(sent().url).toBe(URL);
        expect(sent().method).toBe('POST');
        expect(sent().body).toEqual({ status: 'sent', externalReference: 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9', occurredAt: expect.stringMatching(/Z$/) });
        expect(sent().headers['Idempotency-Key']).toBe('jrnyflw-test-run-id-invoice-INV/1-sent');
        expect(result).toMatchObject({ ok: true, output: { documentNumber: 'INV/1', changed: true } });
    });

    test('records failed as "CODE: message"', async () => {
        await run({ status: 'failed', errorCode: 'REJECTED', message: 'Shoprite said no' });
        expect(sent().body).toMatchObject({ status: 'failed', message: 'REJECTED: Shoprite said no' });
        expect(sent().body).not.toHaveProperty('externalReference');
    });

    test('a failed step with no code or message still records why', async () => {
        await run({ status: 'failed', errorCode: '', message: '' });
        expect(sent().body.message).toBe('Send Invoice failed before it ran; see this run in JRNYFLW');
    });

    test('caps the message at 2,000 characters', async () => {
        await run({ status: 'failed', errorCode: 'INVALID', message: 'x'.repeat(3000) });
        expect(sent().body.message).toHaveLength(2000);
        expect(sent().body.message.endsWith('…')).toBe(true);
    });

    test.each([
        [{ invoiceNumber: ' ', status: 'sent', externalReference: 'r' }, 'Invoice Number is required'],
        [{ status: 'sent', externalReference: ' ' }, 'External Reference is required when the status is sent'],
        [{ status: 'maybe' }, 'Status must be sent or failed'],
    ])('rejects %j before calling JRNY', async (props, message) => {
        const result = await run({ ...props, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message } });
        expect(sendRequest).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/pieces/custom/jrny && npx vitest run test/record-invoice-result.test.ts`
Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Write the implementation**

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';

export const recordInvoiceResult = createAction({
  auth: jrnyAuth,
  name: 'record_invoice_result',
  displayName: 'Record Invoice Result',
  description: 'Tells JRNY an invoice was sent to the customer (it stops being listed as unsent) or failed (JRNY shows the reason).',
  props: {
    invoiceNumber: Property.ShortText({ displayName: 'Invoice Number', required: false }),
    status: Property.StaticDropdown<'sent' | 'failed'>({
      displayName: 'Status',
      required: true,
      defaultValue: 'sent',
      options: { options: [{ label: 'Sent', value: 'sent' }, { label: 'Failed', value: 'failed' }] },
    }),
    externalReference: Property.ShortText({
      displayName: 'External Reference',
      description: "Required for sent: the customer's reference for the invoice, e.g. Send Invoice's invoiceRefNo.",
      required: false,
    }),
    errorCode: Property.ShortText({ displayName: 'Error Code', description: 'For failed, e.g. INVALID, REJECTED or UNCONFIRMED. Goes in front of the message.', required: false }),
    message: Property.LongText({ displayName: 'Message', description: 'For failed: why it failed.', required: false }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const invoiceNumber = (p.invoiceNumber ?? '').trim();
        if (invoiceNumber === '') throw new Error('Invoice Number is required');
        const status = String(p.status ?? '');
        if (status !== 'sent' && status !== 'failed') throw new Error('Status must be sent or failed');
        const occurredAt = new Date().toISOString();
        const body = status === 'sent' ? sentBody({ externalReference: p.externalReference, occurredAt }) : { status, message: failureMessage({ code: p.errorCode, message: p.message }), occurredAt };
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/invoices/${encodeURIComponent(invoiceNumber)}/api-delivery`;
        // Per run, so an engine retry of this step repeats safely while the next run's report is a new one.
        const headers = { 'Idempotency-Key': `jrnyflw-${context.run.id}-invoice-${invoiceNumber}-${status}` };
        const response = await jrnyClient.callJrny<unknown>({ trace, auth, method: HttpMethod.POST, path, body, headers });
        return isRecord(response) && isRecord(response['data']) ? response['data'] : response;
      },
    });
  },
});

function sentBody({ externalReference, occurredAt }: { externalReference: unknown; occurredAt: string }): Record<string, string> {
  const reference = String(externalReference ?? '').trim();
  if (reference === '') throw new Error('External Reference is required when the status is sent');
  return { status: 'sent', externalReference: reference.slice(0, MAX_REFERENCE), occurredAt };
}

// JRNY refuses failed without a message, and a step that failed in the engine leaves no code or message to pass on.
function failureMessage({ code, message }: { code: unknown; message: unknown }): string {
  const codeText = String(code ?? '').trim();
  const messageText = String(message ?? '').trim();
  const joined = codeText !== '' && messageText !== '' ? `${codeText}: ${messageText}` : codeText || messageText || 'Send Invoice failed before it ran; see this run in JRNYFLW';
  return joined.length <= MAX_MESSAGE ? joined : `${joined.slice(0, MAX_MESSAGE - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MAX_MESSAGE = 2000;
const MAX_REFERENCE = 255;
```

Register it in `src/index.ts` after `listInvoicesReady`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/jrny && npx vitest run && npx eslint 'src/**/*.ts' && npm run build`
Expected: all tests pass, no lint errors, the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/pieces/custom/jrny
git commit -m "feat(jrny): Record Invoice Result posts api-delivery sent/failed with a per-run idempotency key"
```

### Task 4: Invoices flow generator and flow JSON

**Files:**
- Create: `scripts/uat/gen-shoprite-invoices-flow.ts`
- Create: `docs/integrations/shoprite/shoprite-invoices.flow.json` (generated)
- Create: `docs/integrations/shoprite/invoices-flow.md`

**Interfaces:**
- Consumes:
  - `listInvoicesReady.props` (Task 2) and `recordInvoiceResult.props` (Task 3);
  - `sendInvoice.props` (`packages/pieces/custom/shoprite/src/lib/actions/send-invoice.ts`).
- Produces: `npx tsx scripts/uat/gen-shoprite-invoices-flow.ts <out.json> --from-date YYYY-MM-DD` writes a template that `SharedTemplate` validates.

The flow:
```
trigger  Schedule 0 7-19 * * * Africa/Johannesburg
step_1   JRNY List Invoices Ready to Send   SHOE100, From Date, Max 50, Stop on failure
step_2   Router "Anything to send?"  count > 0
  step_3 Loop on step_1.output.invoices
    step_4 Router "Clean?"  item.clean is true
      Clean → step_5 Shoprite Send Invoice (continue)  → step_6 Router "Sent?" step_5.ok true
                 Sent → step_7 Record Invoice Result sent, externalReference step_5.output.invoiceRefNo
                 Otherwise → step_8 Record Invoice Result failed, errorCode step_5.error.code, message step_5.error.message
      Otherwise → step_9 Record Invoice Result failed, errorCode INVALID, message item.problem
```

- [ ] **Step 1: Write the generator, with self-checks as its test**

```ts
// Builds docs/integrations/shoprite/shoprite-invoices.flow.json and checks it against the import schema and the pieces' real props.
import { writeFileSync } from 'node:fs'
import { SharedTemplate } from '../../packages/shared/src/lib/management/template/template'
import { sendInvoice } from '../../packages/pieces/custom/shoprite/src/lib/actions/send-invoice'
import { listInvoicesReady } from '../../packages/pieces/custom/jrny/src/lib/actions/list-invoices-ready'
import { recordInvoiceResult } from '../../packages/pieces/custom/jrny/src/lib/actions/record-invoice-result'

// Placeholders on purpose: whoever imports must pick the connections.
const SHOPRITE = "{{connections['pick-the-shoprite-connection']}}"
const JRNY = "{{connections['pick-the-jrny-production-connection']}}"
const now = new Date().toISOString()
const item = (path: string) => `{{step_3['item']${path}}}`
const listOf = (key: string) => `{{flattenNestedKeys(step_3, ['item', 'lines', '${key}'])}}`

const out = process.argv[2]
const fromDate = argAfter('--from-date')
if (out === undefined || fromDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    console.error('usage: gen-shoprite-invoices-flow.ts <out.json> --from-date YYYY-MM-DD (the switch-over date)')
    process.exit(1)
}

function argAfter(flag: string): string | undefined {
    const index = process.argv.indexOf(flag)
    return index === -1 ? undefined : process.argv[index + 1]
}

function piece({ name, displayName, pieceName, actionName, input, dynamic = [], inLoop = false }: { name: string; displayName: string; pieceName: string; actionName: string; input: Record<string, unknown>; dynamic?: string[]; inLoop?: boolean }) {
    const propertySettings = Object.fromEntries(Object.keys(input).filter((key) => key !== 'auth').map((key) => [key, { type: dynamic.includes(key) ? 'DYNAMIC' : 'MANUAL' }]))
    return {
        name, displayName, type: 'PIECE', valid: false, skip: false, lastUpdatedDate: now,
        settings: { pieceName, pieceVersion: '0.1.0', actionName, input, propertySettings, sampleData: {}, errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: inLoop } } },
    }
}

function router({ name, displayName, branchName, conditions, child, otherwise = null }: { name: string; displayName: string; branchName: string; conditions: unknown[]; child: unknown; otherwise?: unknown }) {
    return {
        name, displayName, type: 'ROUTER', valid: true, skip: false, lastUpdatedDate: now,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: [{ branchType: 'CONDITION', branchName, conditions: [conditions] }, { branchType: 'FALLBACK', branchName: 'Otherwise' }] },
        children: [child, otherwise],
    }
}

const record = ({ name, displayName, input }: { name: string; displayName: string; input: Record<string, unknown> }) =>
    piece({ name, displayName, pieceName: '@jrnyflw/jrny', actionName: 'record_invoice_result', inLoop: true, input: { auth: JRNY, invoiceNumber: item("['invoiceNumber']"), ...input, onFailure: 'continue' } })

const recordSent = record({ name: 'step_7', displayName: 'Record sent in JRNY', input: { status: 'sent', externalReference: "{{step_5['output']['invoiceRefNo']}}" } })
const recordFailed = record({ name: 'step_8', displayName: 'Record failed in JRNY', input: { status: 'failed', errorCode: "{{step_5['error']['code']}}", message: "{{step_5['error']['message']}}" } })
const recordProblem = record({ name: 'step_9', displayName: 'Record problem in JRNY', input: { status: 'failed', errorCode: 'INVALID', message: item("['problem']") } })

const send = {
    ...piece({
        name: 'step_5', displayName: 'Send Invoice', pieceName: '@jrnyflw/shoprite', actionName: 'send_invoice', dynamic: ['lines'], inLoop: true,
        input: {
            auth: SHOPRITE,
            invoiceNumber: item("['invoiceNumber']"),
            invoiceDate: item("['invoiceDate']"),
            purchaseOrder: item("['purchaseOrder']"),
            storeGln: item("['storeGln']"),
            totalExclVat: item("['totalExclVat']"),
            totalVat: item("['totalVat']"),
            totalInclVat: item("['totalInclVat']"),
            lines: {
                lineNumber: listOf('lineNumber'), quantity: listOf('quantity'), lineTotalExclVat: listOf('lineTotalExclVat'),
                lineTotalInclVat: listOf('lineTotalInclVat'), description: listOf('description'), gtin: listOf('gtin'),
            },
            onFailure: 'continue',
        },
    }),
    nextAction: router({ name: 'step_6', displayName: 'Sent?', branchName: 'Sent', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_5['ok']}}" }], child: recordSent, otherwise: recordFailed }),
}

const clean = router({ name: 'step_4', displayName: 'Clean?', branchName: 'Clean', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: item("['clean']") }], child: send, otherwise: recordProblem })
const loop = { name: 'step_3', displayName: 'Each invoice', type: 'LOOP_ON_ITEMS', valid: true, skip: false, lastUpdatedDate: now, settings: { items: "{{step_1['output']['invoices']}}" }, firstLoopAction: clean }

const ready = {
    ...piece({ name: 'step_1', displayName: 'List Invoices Ready to Send', pieceName: '@jrnyflw/jrny', actionName: 'list_invoices_ready_to_send', input: { auth: JRNY, customerCode: 'SHOE100', fromDate, maxInvoices: 50, onFailure: 'stop' } }),
    nextAction: router({ name: 'step_2', displayName: 'Anything to send?', branchName: 'Invoices to send', conditions: [{ operator: 'NUMBER_IS_GREATER_THAN', firstValue: "{{step_1['output']['count']}}", secondValue: '0' }], child: loop }),
}

const trigger = {
    name: 'trigger', displayName: 'Hourly 07:00 to 19:00', type: 'PIECE_TRIGGER', valid: true, lastUpdatedDate: now,
    settings: {
        pieceName: '@activepieces/piece-schedule', pieceVersion: '0.1.17', triggerName: 'cron_expression',
        input: { cronExpression: '0 7-19 * * *', timezone: 'Africa/Johannesburg' },
        propertySettings: { cronExpression: { type: 'MANUAL' }, timezone: { type: 'MANUAL' } }, sampleData: {},
    },
    nextAction: ready,
}

const template = {
    name: 'Shoprite Invoices from JRNY', type: 'SHARED', summary: '',
    description: `Sends delivered SHOE100 invoices from ${fromDate} on to Shoprite as GS1 invoices and records sent or failed in JRNY. UNCONFIRMED invoices are never resent automatically.`,
    tags: [], blogUrl: '', metadata: { externalId: 'shopriteInvoicesV1xxxxx' }, author: 'JRNYFLW Admin', categories: [],
    pieces: ['@activepieces/piece-schedule', '@jrnyflw/shoprite', '@jrnyflw/jrny'], status: 'PUBLISHED',
    flows: [{ displayName: 'Shoprite Invoices from JRNY', valid: false, schemaVersion: '20', notes: [], trigger }],
}

const propsOf: Record<string, string[]> = {
    list_invoices_ready_to_send: Object.keys(listInvoicesReady.props),
    send_invoice: Object.keys(sendInvoice.props),
    record_invoice_result: Object.keys(recordInvoiceResult.props),
}
const sendLineKeys = Object.keys(sendInvoice.props.lines.properties ?? {})
const problems: string[] = []
for (const step of [ready, send, recordSent, recordFailed, recordProblem]) {
    const known = propsOf[step.settings.actionName]
    for (const key of Object.keys(step.settings.input).filter((k) => k !== 'auth')) {
        if (!known.includes(key)) problems.push(`${step.name} (${step.settings.actionName}) has no prop ${key}`)
    }
}
for (const key of Object.keys(send.settings.input.lines)) {
    if (!sendLineKeys.includes(key)) problems.push(`step_5 lines have no field ${key}`)
}
// The engine checks props before a piece's own Continue handling runs, so only continueOnFailure keeps one bad invoice from stopping the loop.
for (const step of [send, recordSent, recordFailed, recordProblem]) {
    if (step.settings.errorHandlingOptions.continueOnFailure.value !== true) problems.push(`${step.name} must continue on failure: it runs inside the loop`)
}
const parsed = SharedTemplate.safeParse(template)
if (!parsed.success) problems.push(JSON.stringify(parsed.error.issues, null, 2))
if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
}
writeFileSync(out, JSON.stringify(template, null, 2) + '\n')
console.log('valid, written to', out)
```

If `Property.Array`'s `properties` is not readable as `sendInvoice.props.lines.properties`, read the keys the way the TypeScript type allows, without a cast. If that's impossible, list them from `send-invoice.ts` and compare.

- [ ] **Step 2: Run it with a bad prop to see the self-check fail**

Temporarily rename `errorCode` to `errCode` in `recordFailed`'s input.
Run: `npx tsx scripts/uat/gen-shoprite-invoices-flow.ts /tmp/x.json --from-date 2026-10-20`
Expected: exit 1 and "step_8 (record_invoice_result) has no prop errCode". Then restore `errorCode`.

- [ ] **Step 3: Generate the flow**

Run: `npx tsx scripts/uat/gen-shoprite-invoices-flow.ts docs/integrations/shoprite/shoprite-invoices.flow.json --from-date 2026-10-20`
Expected: "valid, written to …".

- [ ] **Step 4: Write `docs/integrations/shoprite/invoices-flow.md`**

It covers:
- what the flow does;
- the one setting that matters, **From Date = the switch-over date**: earlier invoices were sent by the old platform, and an earlier date resends them to Shoprite;
- the connections to pick (Shoprite production with Supplier GLN and VAT Registration Number filled in; JRNY production);
- the step table;
- how UNCONFIRMED and problem invoices show up in JRNY and what staff do: load the GTIN or GLN, the next run sends it; for UNCONFIRMED, check in Shoprite and reset it in JRNY only if Shoprite doesn't have it;
- how to regenerate with another date.

- [ ] **Step 5: Commit**

```bash
git add scripts/uat/gen-shoprite-invoices-flow.ts docs/integrations/shoprite/shoprite-invoices.flow.json docs/integrations/shoprite/invoices-flow.md
git commit -m "feat(shoprite): importable Shoprite invoices flow: JRNY ready list → Send Invoice → record sent/failed"
```

### Task 5: Live orders flow with Acknowledge

**Files:**
- Modify: `scripts/uat/gen-shoprite-orders-flow.ts`
- Create: `docs/integrations/shoprite/shoprite-orders.live.flow.json` (generated)
- Modify: `docs/integrations/shoprite/orders-flow.md`
- Modify: `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md` ("Before and after the switch-over")

**Interfaces:**
- Consumes: `acknowledgeOrders.props` (`orderNumbers`, `onFailure`) from `packages/pieces/custom/shoprite/src/lib/actions/acknowledge-orders.ts`.
- Produces:
  - `gen-shoprite-orders-flow.ts <out.json>`: as today (dev, never acknowledges), unchanged output apart from timestamps;
  - `gen-shoprite-orders-flow.ts <out.json> --acknowledge`: the live flow.

**Live variant changes:**
- The JRNY placeholder becomes `pick-the-jrny-production-connection`. The name becomes "Shoprite Orders → JRNY (live, acknowledges)". The description says it acknowledges and must only run once the old platform has stopped.
- **step_5 "New order?"** gets the fallback child **step_11** "Already in JRNY?", a router: `step_4.ok` is true AND `step_4.output.data` LIST_IS_NOT_EMPTY → **step_12** Acknowledge (order number, continue, in loop).
- **step_9 "Clean and created?"** gets a `nextAction`: **step_13** "In JRNY?", a router with two OR groups:
  - `step_8.ok` is true;
  - `step_8.error.code` TEXT_EXACTLY_MATCHES `DUPLICATE_PORTAL_ORDER`.

  Its child is **step_14** Acknowledge.
- An order with nothing loadable (step_7 Otherwise), or whose Create Quote failed for any other reason, is **not** acknowledged. It comes back on the next download.

- [ ] **Step 1: Add the self-checks first (the generator's test)**

For the live variant only:
- `step_12` and `step_14` exist, and both have `actionName === 'acknowledge_orders'` and `continueOnFailure` true;
- the non-live variant contains no `acknowledge_orders` anywhere: check with `JSON.stringify(template).includes('acknowledge_orders')`.

Run: `npx tsx scripts/uat/gen-shoprite-orders-flow.ts /tmp/x.json --acknowledge`
Expected: exit 1, "live flow must acknowledge in step_12 and step_14".

- [ ] **Step 2: Build the live steps**

```ts
const live = process.argv.includes('--acknowledge')
const ack = (name: string) => piece({ name, displayName: 'Acknowledge Order', pieceName: '@jrnyflw/shoprite', actionName: 'acknowledge_orders', inLoop: true, input: { auth: SHOPRITE, orderNumbers: item("['orderNumber']"), onFailure: 'continue' } })
```

Extend `router()` to take `otherwise` (default `null`) and `anyOf?: unknown[][]`, which replaces `[conditions]` when given. Wire:
- `alreadyLoaded.nextAction` = `router({ …step_5…, otherwise: live ? router({ name: 'step_11', displayName: 'Already in JRNY?', branchName: 'Acknowledge it', conditions: [ok4, listNotEmpty4], child: ack('step_12') }) : null })`
- `quote.nextAction` (step_9) gets `nextAction: live ? router({ name: 'step_13', displayName: 'In JRNY?', branchName: 'Acknowledge it', anyOf: [[ok8], [dup8]], child: ack('step_14') }) : undefined`. Omit the key when not live.
- with `dup8 = { operator: 'TEXT_EXACTLY_MATCHES', firstValue: "{{step_8['error']['code']}}", secondValue: 'DUPLICATE_PORTAL_ORDER', caseSensitive: true }`.

Add `acknowledge_orders: Object.keys(acknowledgeOrders.props)` to `propsOf`. Add the ack steps to the prop and continue-on-failure loops when live.

- [ ] **Step 3: Generate both and check**

```bash
npx tsx scripts/uat/gen-shoprite-orders-flow.ts docs/integrations/shoprite/shoprite-orders.flow.json
git diff docs/integrations/shoprite/shoprite-orders.flow.json | grep '^[+-] ' | grep -v lastUpdatedDate   # Expected: nothing
npx tsx scripts/uat/gen-shoprite-orders-flow.ts docs/integrations/shoprite/shoprite-orders.live.flow.json --acknowledge
```

Expected: both print "valid, written to …", and the dev flow is unchanged apart from `lastUpdatedDate`.

- [ ] **Step 4: Docs**

- **orders-flow.md** gets a "Live flow (switch-over)" section:
  - which file to import, and that the dev flow must be switched off or deleted;
  - the old platform must have stopped downloading and acknowledging first;
  - the extra steps 11–14;
  - what is never acknowledged, and why that is safe.
- **The orders spec's "Before and after the switch-over"** records the rule: acknowledge per order when it is in JRNY (found, created, or `DUPLICATE_PORTAL_ORDER`). An order with nothing loadable is not acknowledged and comes back every run until staff load it in JRNY with the Shoprite order number as the external reference and portal code `SHOPRITE`.

- [ ] **Step 5: Commit**

```bash
git add scripts/uat/gen-shoprite-orders-flow.ts docs/integrations/shoprite docs/superpowers/specs/2026-10-17-shoprite-orders-design.md
git commit -m "feat(shoprite): live orders flow acknowledges each order once it is in JRNY (found, created, or duplicate portal order)"
```

### Task 6: Verify and finish

- [ ] Run `cd packages/pieces/custom/<p> && npx vitest run` for jrny, shoprite and nucleus, plus piece-trace. Expected: all pass.
- [ ] Run `npx eslint 'src/**/*.ts'` in jrny and shoprite, and `npm run build` in jrny and shoprite (the dist is used by `AP_DEV_PIECES`).
- [ ] Re-generate all three flow files and confirm each prints "valid".
