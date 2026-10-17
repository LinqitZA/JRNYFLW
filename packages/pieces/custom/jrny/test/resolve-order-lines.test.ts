import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { resolveOrderLines } from '../src/lib/actions/resolve-order-lines';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };
const BASE = 'https://jrny/api/v1/integration/entities/ent-1';
const ADDRESSES = `${BASE}/customers/SHOE100/addresses`;

function httpError({ status, data }: { status: number; data: unknown }) {
    const config = { headers: new AxiosHeaders() };
    return new HttpError({}, new AxiosError('HTTP error', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

const notFound = () => httpError({ status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } });

function routes(table: Record<string, unknown>) {
    sendRequest.mockImplementation(async (req: { url: string }) => {
        const answer = table[req.url];
        if (answer === undefined) throw notFound();
        if (answer instanceof Error) throw answer;
        return { status: 200, body: answer };
    });
}

function urls(): string[] {
    return sendRequest.mock.calls.map((call) => call[0].url);
}

const shoe100 = { data: [{ addressCode: '1608' }, { addressCode: '0001' }], total: 2 };
const product = (stockCode: string, extra: Record<string, unknown> = {}) => ({ stockCode, description: stockCode, isActive: true, ...extra });

function run(props: Record<string, unknown>) {
    const propsValue = { customerCode: 'SHOE100', addressCode: '1608', notePrefix: 'Shoprite PO 1221181491, TEST STORE (1608)', ...props };
    return resolveOrderLines.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('resolveOrderLines', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('a stock code JRNY knows goes through, with Shoprite\'s price', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [{ stockCode: 'CSL1388', barcode: '06001001438896', quantity: 2, unitPrice: 30, description: 'KEY CONTROL', reference: '1' }] });
        expect(result.output).toEqual({
            addressCode: '1608', addressFallback: false,
            lines: [{ stockCode: 'CSL1388', qty: 2, unitPrice: 30, reference: '1', matchedBy: 'stockCode' }],
            lineCount: 1, dropped: [], clean: true, notes: 'Shoprite PO 1221181491, TEST STORE (1608).',
        });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('an unknown stock code falls back to the barcode, sent exactly as given', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: product('XSTAMP25') });
        const result = await run({ lines: [{ stockCode: 'OLDCODE', barcode: '06001224126747', quantity: 1, unitPrice: 50, description: 'X STAMPER', reference: '3' }] });
        expect(urls()).toContain(`${BASE}/products/by-barcode/06001224126747`);
        expect(result.output).toMatchObject({ lines: [{ stockCode: 'XSTAMP25', matchedBy: 'barcode', reference: '3' }], clean: true });
    });

    test('a blank stock code goes straight to the barcode', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: product('XSTAMP25') });
        await run({ lines: [{ stockCode: '', barcode: '06001224126747', quantity: 1, reference: '3' }] });
        expect(urls()).toEqual([ADDRESSES, `${BASE}/products/by-barcode/06001224126747`]);
    });

    test('a line found by neither is dropped and named in the notes', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [
            { stockCode: 'CSL1388', quantity: 1, unitPrice: 30, reference: '1' },
            { stockCode: '', barcode: '06001224126747', quantity: 2, description: 'X STAMPER BOOK PK25', reference: '3' },
        ] });
        expect(result.output).toMatchObject({
            lineCount: 1, clean: false,
            dropped: [{ reference: '3', description: 'X STAMPER BOOK PK25', stockCode: null, barcode: '06001224126747', reason: 'item not found' }],
            notes: 'Shoprite PO 1221181491, TEST STORE (1608).\nNot loaded: line 3 X STAMPER BOOK PK25 (barcode 06001224126747): item not found.',
        });
    });

    test('a 404 without a JRNY error body (e.g. the barcode route not deployed yet) counts as not found', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: httpError({ status: 404, data: { statusCode: 404, message: 'Cannot GET' } }) });
        const result = await run({ lines: [{ barcode: '06001224126747', quantity: 1, reference: '3' }] });
        expect(result.output).toMatchObject({ dropped: [{ reason: 'item not found' }] });
    });

    test('an inactive product is dropped', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/OLD1`]: product('OLD1', { isActive: false }) });
        const result = await run({ lines: [{ stockCode: 'OLD1', quantity: 1, reference: '1' }] });
        expect(result.output).toMatchObject({ dropped: [{ stockCode: 'OLD1', reason: 'inactive in JRNY' }], lineCount: 0 });
    });

    test('a quantity of 0 is dropped without looking the item up', async () => {
        routes({ [ADDRESSES]: shoe100 });
        const result = await run({ lines: [{ stockCode: 'CSL1388', quantity: 0, reference: '1' }] });
        expect(result.output).toMatchObject({ dropped: [{ reason: 'quantity must be more than 0' }] });
        expect(urls()).toEqual([ADDRESSES]);
    });

    test('an unknown or blank delivery address uses the fallback, and says so', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const line = { stockCode: 'CSL1388', quantity: 1, reference: '1' };
        const unknown = await run({ addressCode: 'G622', lines: [line] });
        expect(unknown.output).toMatchObject({ addressCode: '0001', addressFallback: true, clean: false });
        expect(unknown.output?.notes).toContain('Delivery address G622 not found; used 0001.');
        const blank = await run({ addressCode: '', fallbackAddressCode: 'HQ', lines: [line] });
        expect(blank.output).toMatchObject({ addressCode: 'HQ', addressFallback: true });
    });

    test('an unknown customer fails the step', async () => {
        routes({});
        const result = await run({ customerCode: 'SHOE100', onFailure: 'continue', lines: [] });
        expect(result).toMatchObject({ ok: false, error: { status: 404 } });
    });

    test('a JRNY server error fails the step instead of dropping lines', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: httpError({ status: 500, data: { error: { code: 'INTERNAL', message: 'boom' } } }) });
        const result = await run({ onFailure: 'continue', lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }] });
        expect(result).toMatchObject({ ok: false, error: { status: 500 } });
    });

    test('looks each code up once, even on repeated lines', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        await run({ lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }, { stockCode: 'CSL1388', quantity: 3, reference: '2' }] });
        expect(urls().filter((url) => url.endsWith('/products/CSL1388'))).toHaveLength(1);
    });

    test('encodes a stock code with a slash', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/1%2FSEALS`]: product('1/SEALS') });
        const result = await run({ lines: [{ stockCode: '1/SEALS', quantity: 20, reference: '7' }] });
        expect(result.output).toMatchObject({ lines: [{ stockCode: '1/SEALS', qty: 20 }] });
    });

    test('leaves the unit price out when the line has none, so JRNY prices it', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [{ stockCode: 'CSL1388', quantity: 1, unitPrice: null, reference: '1' }] });
        expect(result.output?.lines[0]).toEqual({ stockCode: 'CSL1388', qty: 1, reference: '1', matchedBy: 'stockCode' });
    });
});
