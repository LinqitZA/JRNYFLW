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
import { sendInvoice } from '../src/lib/actions/send-invoice';
import { shopriteAuth, ShopriteAuth } from '../src/lib/auth';
import { gs1Invoice } from '../src/lib/gs1-invoice';
import { invoiceProps, SENT_AT, SUPPLIER } from './fixtures/invoice';

const PASSWORD = 'shoprite-secret-pass';
const REF_NO = 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9';
const AUTH: ShopriteAuth = {
    baseUrl: 'https://x/b2bservice/',
    username: 'u',
    password: PASSWORD,
    contractId: 'c',
    invoiceEndpoint: 'VendorInvoice',
    supplierGln: SUPPLIER.gln,
    vatRegistrationNumber: SUPPLIER.vatRegistrationNumber,
};
const CONFIRMED = { status: 200, body: '<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">1 record was successfully inserted</string>' };

function run({ propsValue, auth = AUTH }: { propsValue: Record<string, unknown>; auth?: ShopriteAuth }) {
    return sendInvoice.run({ ...createMockActionContext({ propsValue }), auth: { props: auth } });
}

function httpError({ status, data }: { status: number; data: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError({}, new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

describe('sendInvoice', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(SENT_AT);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('POSTs the invoice XML to VendorInvoice and returns Shoprite\'s confirmation', async () => {
        sendRequest.mockResolvedValueOnce(CONFIRMED);
        const result = await run({ propsValue: invoiceProps() });
        const request = sendRequest.mock.calls[0][0];
        expect(request).toMatchObject({
            method: 'POST',
            url: 'https://x/b2bservice/api/VendorInvoice',
            headers: expect.objectContaining({ 'Content-Type': 'application/xml', ContractID: 'c', UIUser: 'u' }),
        });
        expect(request.body).toBe(gs1Invoice.toXml({ invoice: gs1Invoice.check(invoiceProps()), supplier: SUPPLIER, invoiceRefNo: REF_NO, sentAt: SENT_AT }));
        expect(result).toMatchObject({
            ok: true,
            output: {
                invoiceNumber: 'INV-1001',
                invoiceRefNo: REF_NO,
                purchaseOrder: '1220000001',
                storeGln: '6001234567899',
                lineCount: 2,
                totalInclVat: 241.62,
                shopriteMessage: '1 record was successfully inserted',
            },
        });
        expect(JSON.stringify(result)).not.toContain(PASSWORD);
    });

    test('posts to B2BInvoice when the connection says so', async () => {
        sendRequest.mockResolvedValueOnce(CONFIRMED);
        await run({ propsValue: invoiceProps(), auth: { ...AUTH, invoiceEndpoint: 'B2BInvoice' } });
        expect(sendRequest.mock.calls[0][0].url).toBe('https://x/b2bservice/api/B2BInvoice');
    });

    test('accepts a 201 confirmation', async () => {
        sendRequest.mockResolvedValueOnce({ ...CONFIRMED, status: 201 });
        const result = await run({ propsValue: invoiceProps() });
        expect(result).toMatchObject({ ok: true });
    });

    test('refuses an invoice that fails the checks, without calling Shoprite', async () => {
        const result = await run({ propsValue: { ...invoiceProps({ purchaseOrder: '' }), onFailure: 'continue' } });
        expect(result).toMatchObject({ ok: false, error: { message: 'Purchase Order is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('needs a valid Supplier GLN and a VAT Registration Number on the connection', async () => {
        const propsValue = { ...invoiceProps(), onFailure: 'continue' };
        expect(await run({ propsValue, auth: { ...AUTH, supplierGln: undefined } })).toMatchObject({
            ok: false,
            error: { message: 'Add the Supplier GLN to the Shoprite connection' },
        });
        expect(await run({ propsValue, auth: { ...AUTH, supplierGln: '6009876543210' } })).toMatchObject({
            ok: false,
            error: { message: 'The Supplier GLN on the Shoprite connection (6009876543210) must be 13 digits with a valid check digit' },
        });
        expect(await run({ propsValue, auth: { ...AUTH, vatRegistrationNumber: '  ' } })).toMatchObject({
            ok: false,
            error: { message: 'Add the VAT Registration Number to the Shoprite connection' },
        });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('returns Shoprite\'s error message without the stack trace', async () => {
        sendRequest.mockRejectedValueOnce(httpError({
            status: 400,
            data: '<Error><Message>Validation Error:  The Invoice Message is empty or not recognized.</Message><StackTrace>   at B2B.GS1</StackTrace></Error>',
        }));
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'Validation Error: The Invoice Message is empty or not recognized.', status: 400 },
        });
        expect(result.sent[0].status).toBe(400);
    });

    test('treats a 200 without the confirmation as a failure to check in Shoprite', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: '<string>0 records inserted</string>' });
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'Shoprite answered 200 but did not confirm the invoice: <string>0 records inserted</string>. Check in Shoprite before resending.' },
        });
    });

    test('stops the run by default when Shoprite rejects the invoice', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 400, data: '<Error><Message>Validation Error: bad</Message></Error>' }));
        await expect(run({ propsValue: invoiceProps() })).rejects.toThrow('Validation Error: bad');
    });
});

describe('sendInvoice error codes', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('marks invoices that fail the checks INVALID', async () => {
        const result = await run({ propsValue: { ...invoiceProps({ purchaseOrder: '' }), onFailure: 'continue' } });
        expect(result).toMatchObject({ ok: false, error: { code: 'INVALID' } });
        const noSupplier = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' }, auth: { ...AUTH, supplierGln: undefined } });
        expect(noSupplier).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    });

    test('marks a Shoprite error answer REJECTED', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 400, data: '<Error><Message>Validation Error: bad</Message></Error>' }));
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({ ok: false, error: { code: 'REJECTED', message: 'Validation Error: bad' } });
    });

    test('marks a 2xx without the confirmation UNCONFIRMED', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: '<string>0 records were successfully inserted</string>' });
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({ ok: false, error: { code: 'UNCONFIRMED' } });
    });

    // pieces-common turns a dropped connection or timeout into an HttpError with status 500 and no body; the invoice may still have landed.
    test('marks no answer from Shoprite UNCONFIRMED instead of reporting a Shoprite 500', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('socket hang up', 'ECONNRESET', config)));
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UNCONFIRMED',
                message: 'No answer from Shoprite (the connection failed or timed out, or it returned an empty server error). Check in Shoprite before resending.',
            },
        });
    });
});

describe('Shoprite connection', () => {
    test('offers Supplier GLN and VAT Registration Number as optional fields, so existing connections stay valid', () => {
        expect(shopriteAuth.props.supplierGln).toMatchObject({ displayName: 'Supplier GLN', required: false });
        expect(shopriteAuth.props.vatRegistrationNumber).toMatchObject({ displayName: 'VAT Registration Number', required: false });
    });
});
