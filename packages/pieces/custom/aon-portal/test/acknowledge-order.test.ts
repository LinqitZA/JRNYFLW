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
import { acknowledgeOrder } from '../src/lib/actions/acknowledge-order';

const API_KEY = 'a6205760-test-key-0000';
const auth = { props: { portalUrl: 'https://portal.example', apiKey: API_KEY } };
const ORDER_ID = '573a4daa-1f9d-48a4-9e13-90f840fae544';

function run(propsValue: Record<string, unknown>) {
    return acknowledgeOrder.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('acknowledgeOrder', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('PUTs the trimmed ERP order number to the order', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { id: ORDER_ID, erpOrderNumber: 'QU-0001' } });
        const result = await run({ orderId: ` ${ORDER_ID} `, erpOrderNumber: ' QU-0001 ' });
        const req = sendRequest.mock.calls[0][0];
        expect(req.method).toBe('PUT');
        expect(req.url).toBe(`https://portal.example/api/erp/orders/${ORDER_ID}/acknowledge`);
        expect(req.body).toEqual({ erpOrderNumber: 'QU-0001' });
        expect(result.output).toEqual({ id: ORDER_ID, erpOrderNumber: 'QU-0001' });
    });

    test('rejects an orderNumber passed as the Order ID without calling the portal', async () => {
        const result = await run({ orderId: '10001', erpOrderNumber: 'QU-0001', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: "Order ID must be the order's id (a UUID), not its orderNumber" } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('rejects a blank ERP order number without calling the portal', async () => {
        const result = await run({ orderId: ORDER_ID, erpOrderNumber: '   ', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'ERP Order Number is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('a failed acknowledge never shows the API key', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(
            new HttpError({ erpOrderNumber: 'QU-0001' }, new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { status: 401, statusText: '', headers: {}, config, data: { error: 'API key required' } })),
        );
        const result = await run({ orderId: ORDER_ID, erpOrderNumber: 'QU-0001', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { status: 401 } });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });
});
