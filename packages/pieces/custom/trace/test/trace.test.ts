/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { AuthenticationType, HttpError, HttpMethod } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { pieceTrace } from '../src';

function httpError({ status, data, requestBody }: { status: number; data: unknown; requestBody: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
        status, statusText: '', headers: {}, config, data,
    });
    return new HttpError(requestBody, axiosError);
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
    throw new Error('expected the promise to reject');
}

describe('pieceTrace.run', () => {
    beforeEach(() => sendRequest.mockReset());

    test('records every call in order and wraps the output', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { id: 1 } });
        sendRequest.mockResolvedValueOnce({ status: 201, body: { id: 2 } });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', queryParams: { q: '1' } } });
                const second = await trace.send<{ id: number }>({
                    request: { method: HttpMethod.POST, url: 'https://api/b', headers: { 'Content-Type': 'application/json' }, body: { name: 'x' } },
                });
                return second.body;
            },
        });
        expect(result).toEqual({
            ok: true,
            output: { id: 2 },
            sent: [
                { method: 'GET', url: 'https://api/a', query: { q: '1' }, headers: {}, body: null, status: 200, durationMs: expect.any(Number) },
                { method: 'POST', url: 'https://api/b', query: {}, headers: { 'Content-Type': 'application/json' }, body: { name: 'x' }, status: 201, durationMs: expect.any(Number) },
            ],
        });
    });

    test('redacts auth headers whatever their case, and the authentication option', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', headers: { authorization: 'Basic abc', Authentication: 'abc', ContractID: 'C1', UIUser: 'u1' } } });
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/b', authentication: { type: AuthenticationType.BEARER_TOKEN, token: 'tok' } } });
            },
        });
        expect(result.sent[0].headers).toEqual({ authorization: '[redacted]', Authentication: '[redacted]', ContractID: 'C1', UIUser: 'u1' });
        expect(result.sent[1].headers).toEqual({ Authorization: '[redacted]' });
    });

    test('redacts an X-API-Key header whatever its case', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a', headers: { 'X-API-Key': 'k1', 'x-api-key': 'k2', Accept: 'application/json' } } });
            },
        });
        expect(result.sent[0].headers).toEqual({ 'X-API-Key': '[redacted]', 'x-api-key': '[redacted]', Accept: 'application/json' });
    });

    test('records bodyForTrace instead of the real body', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/token', body: 'password=abc' }, bodyForTrace: 'password=[redacted]' }),
        });
        expect(result.sent[0].body).toBe('password=[redacted]');
        expect(sendRequest.mock.calls[0][0].body).toBe('password=abc');
    });

    test('truncates bodies over 50 KB and leaves smaller ones alone', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: undefined,
            secrets: [],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a', body: { image: 'a'.repeat(60 * 1024) } } });
                await trace.send({ request: { method: HttpMethod.POST, url: 'https://api/b', body: 'small' } });
            },
        });
        const truncated = String(result.sent[0].body);
        expect(truncated.length).toBeLessThan(52 * 1024);
        expect(truncated).toMatch(/…\[truncated, 61 KB\]$/);
        expect(result.sent[1].body).toBe('small');
    });

    test('scrubs connection secrets from sent and from the error, ignoring secrets under 4 characters', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: {} });
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: ['hunter22', 'ab', ''],
            work: async (trace) => {
                await trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a?key=hunter22', queryParams: { k: 'hunter22' }, body: { nested: ['x hunter22 y'] } } });
                throw new Error('bad key hunter22 for ab');
            },
        });
        expect(result).toMatchObject({
            ok: false,
            output: null,
            error: { message: 'bad key [redacted] for ab', status: null },
            sent: [{ url: 'https://api/a?key=[redacted]', query: { k: '[redacted]' }, body: { nested: ['x [redacted] y'] }, status: 200 }],
        });
        expect(JSON.stringify(result)).not.toContain('hunter22');
    });

    test('stop: throws the HTTP status and response body plus what was sent, never the HttpError request body', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 409, data: { error: 'Conflict' }, requestBody: 'password=topsecret' }));
        const message = await failureOf(pieceTrace.run({
            onFailure: 'stop',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a', body: 'password=topsecret' }, bodyForTrace: 'password=[redacted]' }),
        }));
        expect(message).toMatch(/^HTTP 409: \{"error":"Conflict"\}\nSent: \[/);
        expect(message).toContain('"status":409');
        expect(message).not.toContain('topsecret');
    });

    test('continue: returns an HTTP failure as data with its status', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 409, data: { error: 'Conflict' }, requestBody: {} }));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.POST, url: 'https://api/a' } }),
        });
        expect(result).toEqual({
            ok: false,
            output: null,
            error: { message: 'HTTP 409: {"error":"Conflict"}', status: 409 },
            sent: [expect.objectContaining({ url: 'https://api/a', status: 409 })],
        });
    });

    test('describes an HttpError with no response body', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 500, data: undefined, requestBody: {} }));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a' } }),
        });
        expect(result).toMatchObject({ ok: false, error: { message: 'HTTP 500 with no response body', status: 500 } });
    });

    test('records a non-HTTP send failure on the call itself', async () => {
        sendRequest.mockRejectedValueOnce(new Error('socket hang up'));
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: (trace) => trace.send({ request: { method: HttpMethod.GET, url: 'https://api/a' } }),
        });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'socket hang up', status: null },
            sent: [{ url: 'https://api/a', status: null, error: 'socket hang up' }],
        });
    });

    test('continue: passes on an error code, codes and details, with secrets scrubbed', async () => {
        const failure = Object.assign(new Error('Validation failed'), {
            code: 'VALIDATION_ERROR',
            codes: ['VALIDATION_ERROR', 'STOCK_ITEM_NOT_FOUND'],
            details: { lines: [{ stockCode: 'AA402860', note: 'key hunter22' }] },
        });
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: ['hunter22'],
            work: async () => {
                throw failure;
            },
        });
        expect(result).toMatchObject({
            ok: false,
            error: {
                message: 'Validation failed',
                status: null,
                code: 'VALIDATION_ERROR',
                codes: ['VALIDATION_ERROR', 'STOCK_ITEM_NOT_FOUND'],
                details: { lines: [{ stockCode: 'AA402860', note: 'key [redacted]' }] },
            },
        });
    });

    test('continue: ignores code, codes and details of the wrong type', async () => {
        const failure = Object.assign(new Error('odd'), { code: 42, codes: 'X', details: undefined });
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: async () => {
                throw failure;
            },
        });
        expect(result).toEqual({ ok: false, sent: [], output: null, error: { message: 'odd', status: null } });
    });

    test('continue: a failure before any call returns an empty sent list', async () => {
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: [],
            work: async () => {
                throw new Error('Provide a waybill');
            },
        });
        expect(result).toEqual({ ok: false, sent: [], output: null, error: { message: 'Provide a waybill', status: null } });
    });
});

describe('pieceTrace.run with engine errors', () => {
    test('rethrows engine infrastructure errors unchanged, even in continue mode', async () => {
        const engineError = Object.assign(new Error('Failed to read/write key "nucleus_token"'), { name: 'StorageError', type: 'ENGINE' });
        for (const onFailure of ['stop', 'continue']) {
            const thrown = await pieceTrace.run({
                onFailure,
                secrets: [],
                work: async () => {
                    throw engineError;
                },
            }).then(() => null, (e: unknown) => e);
            expect(thrown).toBe(engineError);
        }
    });
});

describe('pieceTrace.onFailureProperty', () => {
    test('defaults to stopping the flow', () => {
        const prop = pieceTrace.onFailureProperty();
        expect(prop.defaultValue).toBe('stop');
        expect(prop.options.options.map((o) => o.value)).toEqual(['stop', 'continue']);
    });
});
