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
// The by-barcode route wraps its answer in data, unlike the product route.
const barcodeHit = (stockCode: string, extra: Record<string, unknown> = {}) => ({
    data: { stockCode, description: stockCode, barcode: '06001224126747', barcodeType: 'GTIN', uom: 'EA', conversionFactor: '1', stockingUom: 'EA', isPrimary: true, source: 'barcode', ...extra },
});

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
            lines: [{ stockCode: 'CSL1388', qty: 2, unitPrice: 30, reference: '1', matchedBy: 'stockCode', uom: null }],
            lineCount: 1, dropped: [], clean: true, notes: 'Shoprite PO 1221181491, TEST STORE (1608).',
        });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('an unknown stock code falls back to the barcode, sent exactly as given', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: barcodeHit('XSTAMP25') });
        const result = await run({ lines: [{ stockCode: 'OLDCODE', barcode: '06001224126747', quantity: 1, unitPrice: 50, description: 'X STAMPER', reference: '3' }] });
        expect(urls()).toContain(`${BASE}/products/by-barcode/06001224126747`);
        expect(result.output).toMatchObject({ lines: [{ stockCode: 'XSTAMP25', matchedBy: 'barcode', reference: '3', uom: 'EA' }], clean: true });
    });

    // Without a unit JRNY uses the product's default selling unit, which can differ from the unit Shoprite ordered by.
    test('a barcode for a box quotes the line in boxes', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: barcodeHit('CSL1496/A', { uom: 'BOX', conversionFactor: '12' }) });
        const result = await run({ lines: [{ stockCode: '', barcode: '06001224126747', quantity: 5, unitPrice: 120, reference: '2' }] });
        expect(result.output?.lines).toEqual([{ stockCode: 'CSL1496/A', qty: 5, unitPrice: 120, reference: '2', matchedBy: 'barcode', uom: 'BOX' }]);
    });

    test.each([
        { status: 409, code: 'BARCODE_AMBIGUOUS', reason: 'barcode matches more than one JRNY product' },
        { status: 410, code: 'BARCODE_DEACTIVATED', reason: 'barcode deactivated in JRNY' },
        { status: 422, code: 'PRODUCT_DEACTIVATED', reason: 'JRNY cannot use this barcode: Product is deactivated' },
    ])('a barcode JRNY refuses with $status drops the line instead of failing the order', async ({ status, code, reason }) => {
        const refused = httpError({ status, data: { error: { code, message: code === 'PRODUCT_DEACTIVATED' ? 'Product is deactivated' : 'refused' } } });
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388'), [`${BASE}/products/by-barcode/06001224126747`]: refused });
        const result = await run({ lines: [
            { stockCode: 'CSL1388', quantity: 1, reference: '1' },
            { stockCode: '', barcode: '06001224126747', quantity: 2, reference: '2' },
        ] });
        expect(result.output).toMatchObject({ lineCount: 1, clean: false, dropped: [{ reference: '2', barcode: '06001224126747', reason }] });
    });

    test('a barcode answer without a stock code fails the step', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: { stockCode: 'FLAT' } });
        const result = await run({ onFailure: 'continue', lines: [{ barcode: '06001224126747', quantity: 1, reference: '1' }] });
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from JRNY: a barcode match without a stock code' } });
    });

    test('a blank stock code goes straight to the barcode', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: barcodeHit('XSTAMP25') });
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

    // The builder's list mapper reads each field as its own list and skips items missing the key, so a missing unitPrice would shift prices onto other lines.
    test('a line with no unit price keeps the key as null, so the list mapper stays aligned and JRNY prices it', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388'), [`${BASE}/products/SC007`]: product('SC007') });
        const result = await run({ lines: [
            { stockCode: 'CSL1388', quantity: 1, unitPrice: null, reference: '1' },
            { stockCode: 'SC007', quantity: 2, unitPrice: 64.5, reference: '2' },
        ] });
        expect(result.output?.lines).toEqual([
            { stockCode: 'CSL1388', qty: 1, unitPrice: null, reference: '1', matchedBy: 'stockCode', uom: null },
            { stockCode: 'SC007', qty: 2, unitPrice: 64.5, reference: '2', matchedBy: 'stockCode', uom: null },
        ]);
    });
});

describe('resolveOrderLines guards against the engine', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    // The engine validates props before the action runs, so a required Quantity would stop the whole run on one bad line.
    test('Quantity is optional, so a missing quantity is dropped by the action rather than failing the run', () => {
        expect(resolveOrderLines.props.lines.properties?.quantity.required).toBe(false);
    });

    test('order warnings go on the notes and keep the order as a draft', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({
            warnings: ['Line 2 has a Trade Discount 1 of 5.00', 'Order type 221, not a normal order (220)'],
            lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }],
        });
        expect(result.output).toMatchObject({ clean: false, lineCount: 1, dropped: [] });
        expect(result.output?.notes).toBe(
            'Shoprite PO 1221181491, TEST STORE (1608).\nWarning: Line 2 has a Trade Discount 1 of 5.00.\nWarning: Order type 221, not a normal order (220).',
        );
    });

    test('no warnings leaves a clean order clean', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ warnings: [], lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }] });
        expect(result.output).toMatchObject({ clean: true });
    });
});
