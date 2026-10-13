/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { msGraphMail } from '../src';
import { graphCustomApiAuth } from '../src/lib/actions/custom-api-call';

test('the piece exposes Send Email and Custom API Call', () => {
    expect(Object.keys(msGraphMail.actions()).sort()).toEqual(['custom_api_call', 'send_email']);
});

test('Custom API Call gets an app token and sends it as a bearer header', async () => {
    sendRequest.mockResolvedValueOnce({ status: 200, body: { access_token: 'tok-9', expires_in: 3599 } });
    const headers = await graphCustomApiAuth({ props: { tenantId: 't1', clientId: 'c1', clientSecret: 's1-secret', senderMailbox: 'n@aon.co.za' } });
    expect(headers).toEqual({ Authorization: 'Bearer tok-9' });
    expect(sendRequest.mock.calls[0][0].url).toBe('https://login.microsoftonline.com/t1/oauth2/v2.0/token');
});
