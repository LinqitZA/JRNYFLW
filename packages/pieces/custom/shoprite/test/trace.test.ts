/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { sendInvoice } from '../src/lib/actions/send-invoice';
import { ShopriteAuth } from '../src/lib/auth';
import { invoiceProps, SUPPLIER } from './fixtures/invoice';

const PASSWORD = 'Sh0pr1te!pw';
const auth: { props: ShopriteAuth } = {
    props: {
        baseUrl: 'https://x/b2bservice',
        username: 'vendor1',
        password: PASSWORD,
        contractId: 'C-77',
        invoiceEndpoint: 'VendorInvoice',
        supplierGln: SUPPLIER.gln,
        vatRegistrationNumber: SUPPLIER.vatRegistrationNumber,
    },
};

describe('shoprite trace', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('records the invoice POST, redacts both auth headers and keeps ContractID and UIUser', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: '<string>1 record was successfully inserted</string>' });
        const result = await sendInvoice.run({ ...createMockActionContext({ propsValue: invoiceProps() }), auth });
        expect(result.sent[0]).toMatchObject({
            method: 'POST',
            url: 'https://x/b2bservice/api/VendorInvoice',
            headers: { Authorization: '[redacted]', Authentication: '[redacted]', ContractID: 'C-77', UIUser: 'vendor1', 'Content-Type': 'application/xml' },
            status: 200,
        });
        expect(result.sent[0].body).toEqual(expect.stringContaining('<invoiceMessage '));
        const text = JSON.stringify(result);
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain(Buffer.from(`vendor1:${PASSWORD}`).toString('base64'));
    });

    test('continue mode returns a network failure as data', async () => {
        sendRequest.mockRejectedValueOnce(new Error('socket hang up'));
        const result = await sendInvoice.run({ ...createMockActionContext({ propsValue: { ...invoiceProps(), onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({ ok: false, output: null, error: { message: 'socket hang up', status: null } });
    });
});
