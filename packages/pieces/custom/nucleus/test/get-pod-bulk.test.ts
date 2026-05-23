/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { getPodBulk } from '../src/lib/actions/get-pod-bulk';

describe('getPodBulk', () => {
    test('GETs GetPODInformation_Bulk with waybillnumbers + GroupName and a bearer token', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: [{ Waybill: 'W1', POD: 'signed' }] });
        const auth = { props: { baseUrl: 'https://api', username: 'u', password: 'p', groupName: 'G' } };
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: 'W1,W2' } }), auth };
        const result = await getPodBulk.run(ctx);
        const lastCall = sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
        expect(lastCall.method).toBe('GET');
        expect(lastCall.url).toBe('https://api/GetPODInformation_Bulk');
        expect(lastCall.queryParams).toEqual(expect.objectContaining({ waybillnumbers: 'W1,W2', GroupName: 'G' }));
        expect(lastCall.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer TOK' }));
        expect(result).toEqual([{ Waybill: 'W1', POD: 'signed' }]);
    });
});
