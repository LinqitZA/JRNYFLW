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
import { sendEmail } from '../src/lib/actions/send-email';

const SECRET = 'cs~super-secret-value';
const ACCESS_TOKEN = 'eyJ-access-token-123';
const auth = { props: { tenantId: 'aon.onmicrosoft.com', clientId: 'client-123', clientSecret: SECRET, senderMailbox: 'notifications@aon.co.za' } };

function tokenOk() {
    return { status: 200, body: { token_type: 'Bearer', expires_in: 3599, access_token: ACCESS_TOKEN } };
}

function httpError({ status, data }: { status: number; data: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError({}, new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

function run(propsValue: Record<string, unknown>) {
    return sendEmail.run({ ...createMockActionContext({ propsValue }), auth });
}

const BASIC = { to: 'ops@aon.co.za', subject: 'Order 10004 needs attention', body: '<p>Unknown stock code</p>' };

describe('sendEmail', () => {
    beforeEach(() => sendRequest.mockReset());

    test('gets an app token, then sends as the sender mailbox and returns who it went to', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce({ status: 202, body: '' });
        const result = await run({ ...BASIC, bodyType: 'HTML', saveToSentItems: true });

        const tokenCall = sendRequest.mock.calls[0][0];
        expect(tokenCall.method).toBe('POST');
        expect(tokenCall.url).toBe('https://login.microsoftonline.com/aon.onmicrosoft.com/oauth2/v2.0/token');
        expect(tokenCall.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
        expect(new URLSearchParams(tokenCall.body).get('client_secret')).toBe(SECRET);
        expect(new URLSearchParams(tokenCall.body).get('grant_type')).toBe('client_credentials');
        expect(new URLSearchParams(tokenCall.body).get('scope')).toBe('https://graph.microsoft.com/.default');

        const mailCall = sendRequest.mock.calls[1][0];
        expect(mailCall.method).toBe('POST');
        expect(mailCall.url).toBe('https://graph.microsoft.com/v1.0/users/notifications%40aon.co.za/sendMail');
        expect(mailCall.headers).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' });
        expect(mailCall.body).toEqual({
            message: {
                subject: 'Order 10004 needs attention',
                body: { contentType: 'HTML', content: '<p>Unknown stock code</p>' },
                toRecipients: [{ emailAddress: { address: 'ops@aon.co.za' } }],
                ccRecipients: [],
                bccRecipients: [],
                replyTo: [],
            },
            saveToSentItems: true,
        });
        expect(result).toMatchObject({
            ok: true,
            output: { from: 'notifications@aon.co.za', to: ['ops@aon.co.za'], cc: [], bcc: [], subject: 'Order 10004 needs attention' },
        });
    });

    test('sends CC, BCC, Reply To and a text body, and can skip Sent Items', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce({ status: 202, body: '' });
        await run({ ...BASIC, cc: 'a@aon.co.za; b@aon.co.za', bcc: 'audit@aon.co.za', replyTo: ' it@aon.co.za ', bodyType: 'Text', saveToSentItems: false });
        expect(sendRequest.mock.calls[1][0].body).toMatchObject({
            message: {
                body: { contentType: 'Text' },
                ccRecipients: [{ emailAddress: { address: 'a@aon.co.za' } }, { emailAddress: { address: 'b@aon.co.za' } }],
                bccRecipients: [{ emailAddress: { address: 'audit@aon.co.za' } }],
                replyTo: [{ emailAddress: { address: 'it@aon.co.za' } }],
            },
            saveToSentItems: false,
        });
    });

    test('defaults to an HTML body saved to Sent Items', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce({ status: 202, body: '' });
        await run(BASIC);
        expect(sendRequest.mock.calls[1][0].body).toMatchObject({ message: { body: { contentType: 'HTML' } }, saveToSentItems: true });
    });

    test('keeps the client secret and the access token out of the trace', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce({ status: 202, body: '' });
        const result = await run(BASIC);
        expect(result.sent[0].body).toContain('client_secret=[redacted]');
        expect(result.sent[1].headers).toMatchObject({ Authorization: '[redacted]' });
        expect(JSON.stringify(result)).not.toContain(SECRET);
        expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    });

    test('rejects a bad address or an empty To before calling Microsoft', async () => {
        const bad = await run({ ...BASIC, cc: 'ops@aon.co.za, bob@', onFailure: 'continue' });
        expect(bad).toMatchObject({ ok: false, error: { message: 'Not an email address: bob@' } });
        const empty = await run({ ...BASIC, to: ' ; ', onFailure: 'continue' });
        expect(empty).toMatchObject({ ok: false, error: { message: 'To needs at least one email address' } });
        const badReplyTo = await run({ ...BASIC, replyTo: 'a@aon.co.za, b@aon.co.za', onFailure: 'continue' });
        expect(badReplyTo).toMatchObject({ ok: false, error: { message: 'Reply To takes one email address' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('explains a refusal to send as the sender mailbox', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockRejectedValueOnce(httpError({ status: 403, data: { error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } } }));
        const result = await run({ ...BASIC, onFailure: 'continue' });
        expect(result).toMatchObject({
            ok: false,
            error: {
                message: 'Microsoft refused to send as notifications@aon.co.za: check the Mail.Send application permission, admin consent and any application access policy',
                status: 403,
                code: 'ErrorAccessDenied',
            },
        });
    });

    test('explains a sender mailbox that does not exist', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockRejectedValueOnce(httpError({ status: 404, data: { error: { code: 'ErrorInvalidUser', message: 'The requested user is invalid.' } } }));
        const result = await run({ ...BASIC, onFailure: 'continue' });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'The sender mailbox notifications@aon.co.za was not found or has no Exchange Online mailbox', status: 404, code: 'ErrorInvalidUser' },
        });
    });

    test('passes any other Graph error through with its status', async () => {
        sendRequest.mockResolvedValueOnce(tokenOk()).mockRejectedValueOnce(httpError({ status: 400, data: { error: { code: 'ErrorInvalidRecipients', message: 'At least one recipient is not valid.' } } }));
        const result = await run({ ...BASIC, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { status: 400, code: 'ErrorInvalidRecipients' } });
        expect(result.ok ? '' : result.error.message).toContain('At least one recipient is not valid.');
    });

    test('explains a rejected client secret on the token request', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 401, data: { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.', error_codes: [7000215] } }));
        const result = await run({ ...BASIC, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Microsoft rejected the client ID or secret', status: 401 } });
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });
});
