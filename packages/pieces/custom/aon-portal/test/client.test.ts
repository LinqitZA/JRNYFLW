/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError, HttpMethod } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalClient } from '../src/lib/client';
import { aonPortalAuth } from '../src/lib/auth';

const API_KEY = 'a6205760-test-key-0000';
const auth = { portalUrl: 'https://portal.example/', apiKey: API_KEY };
const server = { apiUrl: 'https://ap/', publicUrl: 'https://ap/' };

function httpError({ status, data }: { status: number; data: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError(undefined, new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

describe('aonPortalClient', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('joins the URL without doubling slashes and sends the key header', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ok: 1 } });
        const result = await pieceTrace.run({
            onFailure: 'stop',
            secrets: aonPortalClient.secretsOf(auth),
            work: (trace) => aonPortalClient.call({ trace, auth, method: HttpMethod.GET, path: '/api/erp/orders', query: { status: 'processing' } }),
        });
        const req = sendRequest.mock.calls[0][0];
        expect(req.url).toBe('https://portal.example/api/erp/orders');
        expect(req.headers).toEqual({ 'X-API-Key': API_KEY, Accept: 'application/json' });
        expect(req.queryParams).toEqual({ status: 'processing' });
        expect(result.output).toEqual({ ok: 1 });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });

    test('does not double /api/erp when the Portal URL already ends with it', () => {
        expect(aonPortalClient.joinUrl({ base: 'https://portal.example/api/erp/', path: '/api/erp/orders' })).toBe('https://portal.example/api/erp/orders');
    });
});

describe('aonPortalAuth.validate', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('accepts a key the portal answers with 200', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { orders: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } } });
        expect(await aonPortalAuth.validate?.({ auth, server })).toEqual({ valid: true });
        expect(sendRequest.mock.calls[0][0].queryParams).toEqual({ status: 'processing', limit: '1' });
    });

    test('explains a rejected key', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 401, data: { error: 'API key required' } }));
        expect(await aonPortalAuth.validate?.({ auth, server })).toEqual({ valid: false, error: 'The portal rejected this API key' });
    });

    test('reports other failures with their status and never the key', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 502, data: '<html>Bad Gateway</html>' }));
        const result = await aonPortalAuth.validate?.({ auth, server });
        expect(result).toEqual({ valid: false, error: 'Could not reach the portal: HTTP 502: <html>Bad Gateway</html>' });
        expect(JSON.stringify(result)).not.toContain(API_KEY);
    });
});
