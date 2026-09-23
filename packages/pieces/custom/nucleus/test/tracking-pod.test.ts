/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { ApFile, createMockActionContext } from '@activepieces/pieces-framework';
import { getHubCode } from '../src/lib/actions/get-hub-code';
import { getTracking } from '../src/lib/actions/get-tracking';
import { createTracking } from '../src/lib/actions/create-tracking';
import { getPodBulkExtra } from '../src/lib/actions/get-pod-bulk-extra';
import { createVerbalPod } from '../src/lib/actions/create-verbal-pod';
import { createPodImage } from '../src/lib/actions/create-pod-image';
import { nucleusClient } from '../src/lib/client';

const auth = { props: { baseUrl: 'https://api/', username: 'u', password: 'p', groupName: 'G' } };

function mockResponses(body: unknown) {
    sendRequest.mockReset();
    sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
    sendRequest.mockResolvedValueOnce({ body });
}

function lastRequest() {
    return sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
}

describe('getHubCode', () => {
    test('GETs GetHubCode with only the filters provided', async () => {
        mockResponses({ ResultSets: [[{ HubCode: 'CPT', Suburb: 'AIRLIE' }]] });
        const ctx = { ...createMockActionContext({ propsValue: { suburb: ' Airlie ', city: '' } }), auth };
        const result = await getHubCode.run(ctx);
        expect(lastRequest().url).toBe('https://api/GetHubCode');
        expect(lastRequest().queryParams).toEqual({ Suburb: 'Airlie', GroupName: 'G' });
        expect(result).toEqual({ ResultSets: [[{ HubCode: 'CPT', Suburb: 'AIRLIE' }]] });
    });

    test('rejects a lookup with no filters', async () => {
        sendRequest.mockReset();
        const ctx = { ...createMockActionContext({ propsValue: {} }), auth };
        await expect(getHubCode.run(ctx)).rejects.toThrow('at least one');
        expect(sendRequest).not.toHaveBeenCalled();
    });
});

describe('tracking actions', () => {
    test('getTracking GETs GetTracking for the waybill', async () => {
        mockResponses({ ResultSets: [[]] });
        await getTracking.run({ ...createMockActionContext({ propsValue: { waybill: 'W1' } }), auth });
        expect(lastRequest().method).toBe('GET');
        expect(lastRequest().url).toBe('https://api/GetTracking');
        expect(lastRequest().queryParams).toEqual({ Waybill: 'W1', GroupName: 'G' });
    });

    test('createTracking POSTs createtrack with the event fields', async () => {
        mockResponses({ ResultSets: [[{ SuccessMessage: 'SUCCESS' }]] });
        const propsValue = { waybill: 'W1', dateStamp: '2026/09/23', eventCode: 'DEL', actionTaken: 'Out for delivery', person: 'JRNY' };
        await createTracking.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().method).toBe('POST');
        expect(lastRequest().url).toBe('https://api/createtrack');
        expect(lastRequest().queryParams).toEqual({
            Waybill: 'W1', DateStamp: '2026/09/23', EventCode: 'DEL', ActionTaken: 'Out for delivery', Person: 'JRNY', GroupName: 'G',
        });
    });

    test('an error row in a 200 response is raised as a failure', async () => {
        mockResponses({ ResultSets: [[{ Error: 'WAYBILL DOES NOT EXIST IN THE SYSTEM!' }]], OutputParameters: {}, ReturnValue: 0 });
        const propsValue = { waybill: 'NOPE', dateStamp: '2026/09/23', eventCode: 'DEL', actionTaken: 'x', person: 'y' };
        await expect(createTracking.run({ ...createMockActionContext({ propsValue }), auth })).rejects.toThrow(
            'Nucleus error: WAYBILL DOES NOT EXIST IN THE SYSTEM!',
        );
    });
});

describe('POD actions', () => {
    test('getPodBulkExtra GETs GetPODInformation_Bulk_Extra', async () => {
        mockResponses([]);
        await getPodBulkExtra.run({ ...createMockActionContext({ propsValue: { waybillNumbers: 'W1,W2' } }), auth });
        expect(lastRequest().url).toBe('https://api/GetPODInformation_Bulk_Extra');
        expect(lastRequest().queryParams).toEqual({ waybillnumbers: 'W1,W2', GroupName: 'G' });
    });

    test('createVerbalPod POSTs createpod with signer, date and time', async () => {
        mockResponses({ ResultSets: [[{ SuccessMessage: 'SUCCESS' }]] });
        const propsValue = { waybill: 'W1', signedBy: 'Jane', podDate: '2026/09/23', podTime: '14:05:00' };
        await createVerbalPod.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().url).toBe('https://api/createpod');
        expect(lastRequest().queryParams).toEqual({ Waybill: 'W1', Podcom1: 'Jane', Poddate: '2026/09/23', Podcom2: '14:05:00', GroupName: 'G' });
    });

    test('createPodImage POSTs a base64 JSON body from a file', async () => {
        mockResponses({ ResultSets: [[{ SucessMessage: 'Image Saved Successfully!' }]] });
        const file = new ApFile('pod.pdf', Buffer.from('hello'), 'pdf');
        const propsValue = { waybill: 'W1', source: 'file', file, imageFormat: 'PDF' };
        await createPodImage.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().url).toBe('https://api/createpodbase64');
        expect(lastRequest().body).toEqual({ Waybill: 'W1', Image: 'aGVsbG8=', StringType: 'BASE64', ImageFormat: 'PDF', GroupName: 'G' });
    });

    test('createPodImage sends a signed URL as-is', async () => {
        mockResponses({ ResultSets: [[{ SucessMessage: 'Image Saved Successfully!' }]] });
        const propsValue = { waybill: 'W1', source: 'signedUrl', signedUrl: 'https://files/pod.jpg?sig=1', imageFormat: 'JPG' };
        await createPodImage.run({ ...createMockActionContext({ propsValue }), auth });
        expect(lastRequest().body).toEqual(expect.objectContaining({ Image: 'https://files/pod.jpg?sig=1', StringType: 'SignedURL' }));
    });

    test('createPodImage fails fast when the chosen source is empty', async () => {
        sendRequest.mockReset();
        const propsValue = { waybill: 'W1', source: 'file', imageFormat: 'PDF' };
        await expect(createPodImage.run({ ...createMockActionContext({ propsValue }), auth })).rejects.toThrow('File is required');
        expect(sendRequest).not.toHaveBeenCalled();
    });
});

describe('throwIfResultSetError', () => {
    test('ignores success rows and non-ResultSets bodies', () => {
        expect(() => nucleusClient.throwIfResultSetError({ ResultSets: [[{ SuccessMessage: 'SUCCESS' }]] })).not.toThrow();
        expect(() => nucleusClient.throwIfResultSetError([{ Waybill: 'W1' }])).not.toThrow();
        expect(() => nucleusClient.throwIfResultSetError('OK')).not.toThrow();
    });

    test('raises ErrorMessage rows', () => {
        expect(() => nucleusClient.throwIfResultSetError({ ResultSets: [[{ ErrorMessage: 'PLEASE PROVIDE A VALID GROUPNAME' }]] })).toThrow(
            'PLEASE PROVIDE A VALID GROUPNAME',
        );
    });
});
