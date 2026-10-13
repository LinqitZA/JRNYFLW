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
import { listOrders } from '../src/lib/actions/list-orders';

const API_KEY = 'a6205760-test-key-0000';
const auth = { props: { portalUrl: 'https://portal.example', apiKey: API_KEY } };

function page({ page, totalPages, total, orders }: { page: number; totalPages: number; total: number; orders: unknown[] }) {
    return { status: 200, body: { orders, pagination: { page, limit: 50, total, totalPages } } };
}

function run(propsValue: Record<string, unknown>) {
    return listOrders.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('listOrders', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('fetches every page and returns the orders once each, with the total', async () => {
        sendRequest
            .mockResolvedValueOnce(page({ page: 1, totalPages: 3, total: 5, orders: [{ id: 'a' }, { id: 'b' }] }))
            .mockResolvedValueOnce(page({ page: 2, totalPages: 3, total: 5, orders: [{ id: 'c' }, { id: 'd' }] }))
            .mockResolvedValueOnce(page({ page: 3, totalPages: 3, total: 5, orders: [{ id: 'e' }] }));
        const result = await run({ status: 'processing' });
        expect(result.output).toEqual({ orders: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }], total: 5 });
        expect(sendRequest.mock.calls.map((c) => c[0].queryParams)).toEqual([
            { status: 'processing', page: '1', limit: '50' },
            { status: 'processing', page: '2', limit: '50' },
            { status: 'processing', page: '3', limit: '50' },
        ]);
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });

    test('defaults to processing and returns an empty list when there are no orders', async () => {
        sendRequest.mockResolvedValueOnce(page({ page: 1, totalPages: 0, total: 0, orders: [] }));
        const result = await run({});
        expect(sendRequest.mock.calls[0][0].queryParams).toEqual(expect.objectContaining({ status: 'processing' }));
        expect(result.output).toEqual({ orders: [], total: 0 });
    });

    test('stops after 100 pages', async () => {
        sendRequest.mockResolvedValue(page({ page: 1, totalPages: 101, total: 5050, orders: [{ id: 'x' }] }));
        const result = await run({ status: 'cancelled', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'More than 5,000 orders with status cancelled; narrow the status or ask for a date filter' } });
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    test('fails clearly on a response without orders or pagination', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { error: 'nope' } });
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from the portal' } });
    });

    test('reports a non-JSON portal error with its status', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError(undefined, new AxiosError('Bad Gateway', 'ERR_BAD_RESPONSE', config, undefined, { status: 502, statusText: '', headers: {}, config, data: '<html>502 Bad Gateway</html>' })));
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'HTTP 502: <html>502 Bad Gateway</html>', status: 502 } });
    });
});
