/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { uploadInvoice } from '../src/lib/actions/upload-invoice';

describe('uploadInvoice', () => {
    test('POSTs the GS1 invoice body to the configured invoice endpoint', async () => {
        sendRequest.mockResolvedValue({ body: 'ok' });
        const invoiceMessage = { invoiceField: [{ invoiceIdentificationField: { entityIdentificationField: 'INV-1' } }] };
        const auth = { props: { baseUrl: 'https://x/b2bservice', username: 'u', password: 'p', contractId: 'c', invoiceEndpoint: 'B2BInvoice' } };
        const ctx = { ...createMockActionContext({ propsValue: { invoiceMessage } }), auth };
        await uploadInvoice.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'POST',
            url: 'https://x/b2bservice/api/B2BInvoice',
            body: invoiceMessage,
        }));
    });
});
