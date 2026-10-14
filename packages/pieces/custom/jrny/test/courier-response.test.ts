import { describe, expect, test, vi, beforeEach } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { HttpError } from '@activepieces/pieces-common';
import { AxiosError, AxiosHeaders } from 'axios';
import { courierResponse } from '../src/lib/actions/courier-response';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'tok' } };

function lastRequest() {
    return sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
}

describe('courierResponse', () => {
    beforeEach(() => sendRequest.mockReset());

    test('PATCHes a booked response to the dispatch note, omitting blank fields', async () => {
        sendRequest.mockResolvedValueOnce({ body: { dispatchNumber: 'DN-000026', courierStatus: 'booked' } });
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'booked', waybillNumber: 'AON-000016', courierReference: '', trackingUrl: '  ' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().method).toBe('PATCH');
        expect(lastRequest().url).toBe('https://jrny/api/v1/integration/entities/ent-1/dispatch-notes/DN-000026/courier-response');
        expect(lastRequest().authentication).toEqual(expect.objectContaining({ token: 'tok' }));
        expect(lastRequest().body).toEqual({ courierStatus: 'booked', waybillNumber: 'AON-000016' });
        expect(result.output).toEqual({ dispatchNumber: 'DN-000026', courierStatus: 'booked' });
    });

    test('sends the error message with a failed response', async () => {
        sendRequest.mockResolvedValueOnce({ body: {} });
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'failed', errorMessage: 'Nucleus error: WAYBILL DOES NOT EXIST' };
        await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().body).toEqual({ courierStatus: 'failed', errorMessage: 'Nucleus error: WAYBILL DOES NOT EXIST' });
    });

    test('sends the hub code and booking warning with a booked response', async () => {
        sendRequest.mockResolvedValueOnce({ body: {} });
        const propsValue = {
            dispatchNumber: 'DN-000026', courierStatus: 'booked', waybillNumber: 'AON-1',
            hubCode: ' UNK ', courierWarning: 'No hub matched 12 Main Rd, Nowhere',
        };
        await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().body).toEqual({
            courierStatus: 'booked', waybillNumber: 'AON-1', hubCode: 'UNK', courierWarning: 'No hub matched 12 Main Rd, Nowhere',
        });
    });

    test('sends a delivered response with the POD link, GRN and when it happened', async () => {
        sendRequest.mockResolvedValueOnce({ body: {} });
        const propsValue = {
            dispatchNumber: 'DN-000026', courierStatus: 'delivered', podSignedBy: 'J Smith', podSignedAt: '2026-10-12T14:05:00+02:00',
            podUrl: 'https://pod.example/AON-1', grnNumber: 'GRN-55', statusAt: '2026-10-12T14:05:00+02:00',
        };
        await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().body).toEqual({
            courierStatus: 'delivered', podSignedBy: 'J Smith', podSignedAt: '2026-10-12T14:05:00+02:00',
            podUrl: 'https://pod.example/AON-1', grnNumber: 'GRN-55', statusAt: '2026-10-12T14:05:00+02:00',
        });
    });

    test('sends the failed step with a failed response', async () => {
        sendRequest.mockResolvedValueOnce({ body: {} });
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'failed', failedStep: 'Create Waybill', errorMessage: 'Create Waybill: timeout' };
        await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().body).toEqual({ courierStatus: 'failed', failedStep: 'Create Waybill', errorMessage: 'Create Waybill: timeout' });
    });

    test('offers every status JRNY accepts, including manifested', () => {
        const options = courierResponse.props.courierStatus.options.options.map((o) => o.value);
        expect(options).toEqual(['booked', 'manifested', 'collected', 'in_transit', 'delivered', 'failed']);
    });

    test('surfaces JRNY error envelopes, e.g. a waybill number already used by another dispatch', async () => {
        const config = { headers: new AxiosHeaders() };
        const conflict = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config,
            data: { error: { code: 'CONFLICT', message: 'Waybill number already in use' } },
        });
        sendRequest.mockRejectedValueOnce(new HttpError({}, conflict));
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'booked', waybillNumber: 'AON-000016' };
        await expect(courierResponse.run({ ...createMockActionContext({ propsValue }), auth })).rejects.toThrow('Waybill number already in use');
    });
});
