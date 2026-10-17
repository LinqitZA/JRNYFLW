/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));

vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { downloadOrders } from '../src/lib/actions/download-orders';
import { ShopriteAuth } from '../src/lib/auth';
import { gs1Document, gs1Line, gs1Order } from './fixtures/gs1';

const authProps: ShopriteAuth = { baseUrl: 'https://x/b2bservice', username: 'u', password: 'p', contractId: 'c', invoiceEndpoint: 'VendorInvoice' };
const auth = { props: authProps };

describe('downloadOrders', () => {
    beforeEach(() => sendRequest.mockReset());

    test('GETs /api/VendorOrder with the auth headers and returns plain orders', async () => {
        const line = gs1Line({ lineNumber: 1, supplierCode: 'CSL1388', gtin: '06001001438896', description: 'KEY CONTROL 5PACK BOOK', quantity: 1, unitExcl: 30, unitIncl: 34.5 });
        sendRequest.mockResolvedValue({ status: 200, body: gs1Document({ orders: [gs1Order({ orderNumber: '1221181491', lines: [line] })] }) });
        const ctx = { ...createMockActionContext({ propsValue: {} }), auth };
        const result = await downloadOrders.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://x/b2bservice/api/VendorOrder',
            headers: expect.objectContaining({ ContractID: 'c', UIUser: 'u' }),
        }));
        expect(result.output).toMatchObject({ count: 1, orderNumbers: '1221181491', orders: [{ orderNumber: '1221181491', lines: [{ gtin: '06001001438896' }] }] });
        expect(JSON.stringify(result)).not.toContain('orderLineItemField');
    });

    test('an unexpected body fails the step with a clear message', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: '<html>Error</html>' });
        const ctx = { ...createMockActionContext({ propsValue: { onFailure: 'continue' } }), auth };
        const result = await downloadOrders.run(ctx);
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from Shoprite: the body is not a GS1 document' } });
    });
});
