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

const authProps: ShopriteAuth = { baseUrl: 'https://x/b2bservice', username: 'u', password: 'p', contractId: 'c', invoiceEndpoint: 'VendorInvoice' };
const auth = { props: authProps };

describe('downloadOrders', () => {
    test('GETs /api/VendorOrder with the auth headers and returns the body', async () => {
        sendRequest.mockResolvedValue({ body: { orderField: [] } });
        const ctx = { ...createMockActionContext({ propsValue: {} }), auth };
        const result = await downloadOrders.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://x/b2bservice/api/VendorOrder',
            headers: expect.objectContaining({ ContractID: 'c', UIUser: 'u' }),
        }));
        expect(result).toEqual({ orderField: [] });
    });
});
