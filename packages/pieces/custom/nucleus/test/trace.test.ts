/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { ApFile, createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { getTracking } from '../src/lib/actions/get-tracking';
import { getHubCode } from '../src/lib/actions/get-hub-code';
import { findHubCodeForAddress } from '../src/lib/actions/find-hub-code-for-address';
import { createPodImage } from '../src/lib/actions/create-pod-image';

const PASSWORD = 'S3cret&pw';
const auth = { props: { baseUrl: 'https://api/', username: 'apiuser', password: PASSWORD, groupName: 'G' } };
const TOKEN_RESPONSE = { status: 200, body: { access_token: 'TOKEN-123456', expires_in: 3599 } };

function httpError({ status, data, requestBody }: { status: number; data: unknown; requestBody: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError(requestBody, new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
        status, statusText: '', headers: {}, config, data,
    }));
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
    throw new Error('expected the promise to reject');
}

function expectNoSecrets(text: string): void {
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(encodeURIComponent(PASSWORD));
    expect(text).not.toContain('TOKEN-123456');
}

describe('nucleus trace', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('records the login with the password redacted, hides the bearer token and keeps GroupName', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[]] } });
        const result = await getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth });
        expect(result.ok).toBe(true);
        expect(result.output).toEqual({ ResultSets: [[]] });
        expect(result.sent.map((c) => c.url)).toEqual(['https://api/token', 'https://api/GetTracking']);
        expect(result.sent[0].body).toBe('username=apiuser&password=[redacted]&grant_type=password');
        expect(result.sent[1].headers).toEqual({ Authorization: '[redacted]' });
        expect(result.sent[1].query).toEqual({ Waybill: 'W1', GroupName: 'G' });
        expectNoSecrets(JSON.stringify(result));
    });

    test('a failed login never shows the password', async () => {
        sendRequest.mockRejectedValueOnce(httpError({
            status: 400,
            data: { error: 'invalid_grant' },
            requestBody: `username=apiuser&password=${encodeURIComponent(PASSWORD)}&grant_type=password`,
        }));
        const message = await failureOf(getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth }));
        expect(message).toContain('HTTP 400: {"error":"invalid_grant"}');
        expectNoSecrets(message);
    });

    test('a large POD image is truncated in sent', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ SucessMessage: 'Image Saved Successfully!' }]] } });
        const file = new ApFile('pod.png', Buffer.alloc(80 * 1024, 1), 'png');
        const propsValue = { waybill: 'W1', source: 'file', file, imageFormat: 'PNG' };
        const result = await createPodImage.run({ ...createMockActionContext({ propsValue }), auth });
        const recorded = String(result.sent[1].body);
        expect(recorded).toMatch(/…\[truncated, \d+ KB\]$/);
        expect(recorded.length).toBeLessThan(52 * 1024);
        expect(sendRequest.mock.calls[1][0].body.Image.length).toBeGreaterThan(100 * 1024);
    });

    test('continue mode returns validation errors as data', async () => {
        const result = await getHubCode.run({ ...createMockActionContext({ propsValue: { onFailure: 'continue' } }), auth });
        expect(result).toEqual({
            ok: false,
            sent: [],
            output: null,
            error: { message: 'Provide at least one of Postal Code, Suburb, City or Province', status: null },
        });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('continue mode returns a Nucleus error row as data', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'WAYBILL DOES NOT EXIST' }]] } });
        const result = await getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1', onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({ ok: false, output: null, error: { message: 'Nucleus error: WAYBILL DOES NOT EXIST', status: null } });
        expect(result.sent[1].status).toBe(200);
    });

    test('stop mode appends what was sent to the error', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'WAYBILL DOES NOT EXIST' }]] } });
        const message = await failureOf(getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth }));
        expect(message).toMatch(/^Nucleus error: WAYBILL DOES NOT EXIST\nSent: \[/);
        expect(message).toContain('https://api/GetTracking');
        expectNoSecrets(message);
    });

    test('Find Hub Code records every lookup it tried', async () => {
        const row = { HubCode: 'CPT', Suburb: 'BELLVILLE', City: 'CAPE TOWN', Province: 'Western Cape', PostalCode: '7530' };
        sendRequest.mockImplementation(async (req: { url: string; queryParams: Record<string, string> }) => {
            if (req.url.endsWith('/token')) {
                return TOKEN_RESPONSE;
            }
            return { status: 200, body: { ResultSets: [req.queryParams['Postal'] ? [] : [row]] } };
        });
        const result = await findHubCodeForAddress.run({ ...createMockActionContext({ propsValue: { suburb: 'Bellville', postalCode: '7530' } }), auth });
        expect(result.output).toEqual(expect.objectContaining({ hubCode: 'CPT', matchedOn: 'suburb' }));
        expect(result.sent.filter((c) => c.url.endsWith('/GetHubCode')).map((c) => c.query)).toEqual([
            { Suburb: 'Bellville', Postal: '7530', GroupName: 'G' },
            { Suburb: 'Bellville', GroupName: 'G' },
        ]);
    });
});
