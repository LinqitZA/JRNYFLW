/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { msGraphMailAuth } from '../src/lib/auth';

const props = { tenantId: 'aon.onmicrosoft.com', clientId: 'client-123', clientSecret: 'cs~secret', senderMailbox: 'notifications@aon.co.za' };

function tokenFailure({ status, error, code }: { status: number; error: string; code: number }): HttpError {
    const config = { headers: new AxiosHeaders() };
    const data = { error, error_description: `AADSTS${code}: something`, error_codes: [code] };
    return new HttpError({}, new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

const server = { apiUrl: 'http://localhost/', publicUrl: 'http://localhost/' };

function validate(auth: typeof props) {
    return msGraphMailAuth.validate?.({ auth, server });
}

describe('msGraphMailAuth.validate', () => {
    beforeEach(() => sendRequest.mockReset());

    test('accepts the connection when Microsoft issues a token', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { access_token: 'tok', expires_in: 3599 } });
        expect(await validate(props)).toEqual({ valid: true });
        expect(sendRequest.mock.calls[0][0].url).toBe('https://login.microsoftonline.com/aon.onmicrosoft.com/oauth2/v2.0/token');
    });

    test('rejects a sender mailbox that is not an email address without calling Microsoft', async () => {
        expect(await validate({ ...props, senderMailbox: 'notifications' })).toEqual({ valid: false, error: 'Sender Mailbox must be an email address' });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('names a bad client ID or secret', async () => {
        sendRequest.mockRejectedValueOnce(tokenFailure({ status: 401, error: 'invalid_client', code: 7000215 }));
        expect(await validate(props)).toEqual({ valid: false, error: 'Microsoft rejected the client ID or secret' });
        sendRequest.mockRejectedValueOnce(tokenFailure({ status: 400, error: 'unauthorized_client', code: 700016 }));
        expect(await validate(props)).toEqual({ valid: false, error: 'Microsoft rejected the client ID or secret' });
    });

    test('names an unknown tenant', async () => {
        sendRequest.mockRejectedValueOnce(tokenFailure({ status: 400, error: 'invalid_request', code: 90002 }));
        expect(await validate(props)).toEqual({ valid: false, error: 'Microsoft does not recognise this tenant ID' });
        sendRequest.mockRejectedValueOnce(tokenFailure({ status: 400, error: 'invalid_request', code: 900023 }));
        expect(await validate(props)).toEqual({ valid: false, error: 'Microsoft does not recognise this tenant ID' });
    });

    test('reports anything else with the reason and without the secret', async () => {
        sendRequest.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND login.microsoftonline.com'));
        const result = await validate(props);
        expect(result).toEqual({ valid: false, error: 'Could not get a token from Microsoft: getaddrinfo ENOTFOUND login.microsoftonline.com' });
        expect(JSON.stringify(result)).not.toContain('cs~secret');
    });
});
