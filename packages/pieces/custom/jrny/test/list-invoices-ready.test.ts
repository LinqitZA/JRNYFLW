import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
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
    beforeEach(() => {
        sendRequest.mockReset();
    });
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
                const config = { headers: new AxiosHeaders() };
                throw new HttpError({}, new AxiosError('Too Many Requests', 'ERR_BAD_REQUEST', config, undefined, {
                    status: 429, statusText: 'Too Many Requests', headers: {}, config,
                    data: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' } },
                }));
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
