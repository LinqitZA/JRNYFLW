/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));

vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { acknowledgeOrders } from '../src/lib/actions/acknowledge-orders';
import { ShopriteAuth } from '../src/lib/auth';

const PASSWORD = 'shoprite-secret-pass';
const authProps: ShopriteAuth = { baseUrl: 'https://x/b2bservice/', username: 'u', password: PASSWORD, contractId: 'c', invoiceEndpoint: 'VendorInvoice' };
const auth = { props: authProps };
const XML_OPEN = '<ArrayOfLong xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';

function run(propsValue: Record<string, unknown>) {
    return acknowledgeOrders.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('acknowledgeOrders', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        sendRequest.mockResolvedValue({ status: 200, body: '' });
    });

    test('PUTs action=Acknowledge with the order number as Shoprite ArrayOfLong XML', async () => {
        const result = await run({ orderNumbers: '1221181491' });
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'PUT',
            url: 'https://x/b2bservice/api/VendorOrder',
            queryParams: { action: 'Acknowledge' },
            headers: expect.objectContaining({ 'Content-Type': 'application/xml', ContractID: 'c', UIUser: 'u' }),
            body: `${XML_OPEN}\r\n  <long>1221181491</long>\r\n</ArrayOfLong>`,
        }));
        expect(result.output).toMatchObject({ acknowledged: ['1221181491'], count: 1 });
        expect(JSON.stringify(result)).not.toContain(PASSWORD);
    });

    test('acknowledges several orders from a comma, space or new-line list, once each', async () => {
        await run({ orderNumbers: '1221181491, 1221184951\n1221181491 1221185428' });
        expect(sendRequest.mock.calls[0][0].body).toBe(
            `${XML_OPEN}\r\n  <long>1221181491</long>\r\n  <long>1221184951</long>\r\n  <long>1221185428</long>\r\n</ArrayOfLong>`,
        );
    });

    test('refuses anything that is not a Shoprite order number, before calling Shoprite', async () => {
        const result = await run({ orderNumbers: '1221181491, PO-7', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Not a Shoprite order number: PO-7' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('refuses an empty list, before calling Shoprite', async () => {
        const result = await run({ orderNumbers: ' , ', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Order Numbers needs at least one order number' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });
});
