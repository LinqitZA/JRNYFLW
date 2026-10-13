/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { getPodBulkExtra } from '../src/lib/actions/get-pod-bulk-extra';
import { getPodBulk } from '../src/lib/actions/get-pod-bulk';
import { createWaybillImportHeader } from '../src/lib/actions/create-waybill-import-header';
import { nucleusPodStatus } from '../src/lib/pod-status';

const TOKEN_RESPONSE = { status: 200, body: { access_token: 'TOK', expires_in: 3599 } };
const LINKS = { trackingUrl: 'https://track.example/?wb=', podUrl: 'https://pod.example/' };
const auth = { props: { baseUrl: 'https://api/', username: 'u', password: 'p', groupName: 'G', ...LINKS } };

// Rows as live Nucleus returned them on 2026-10-13.
const DELIVERED = { waybill: 'AON-50330044', Signature: 'SIGN', Date: '2026/10/12', Time: '12:00', GRVNo: null, NoParcels: 3, ManifestDate: '2026-10-09T00:00:00' };
const IN_TRANSIT = { waybill: 'SHP-50330075', Signature: null, Date: null, Time: null, GRVNo: null, NoParcels: 1, ManifestDate: '2026-10-08T00:00:00' };
const VALID = [{ SuccessMessage: 'OK - Waybill/s - VALID' }];

function lastRequest() {
    return sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
}

describe('parseWaybillList', () => {
    test('trims spaces, drops blanks and repeats so Nucleus does not silently skip waybills', () => {
        expect(nucleusPodStatus.parseWaybillList(' AON-1, AON-2 ,,aon-1\nAON-3 ')).toEqual(['AON-1', 'AON-2', 'AON-3']);
    });
});

describe('toPodStatuses', () => {
    test('maps a delivered row onto the JRNY Courier Response fields', () => {
        const result = nucleusPodStatus.toPodStatuses({ requested: ['AON-50330044'], rows: [DELIVERED], links: LINKS });
        expect(result).toEqual({
            waybills: [{
                waybillNumber: 'AON-50330044',
                delivered: true,
                podSignedBy: 'SIGN',
                podSignedAt: '2026-10-12T12:00:00+02:00',
                manifestDate: '2026-10-09',
                noParcels: 3,
                grvNumber: null,
                trackingUrl: 'https://track.example/?wb=AON-50330044',
                podUrl: 'https://pod.example/AON-50330044',
            }],
            notFound: [],
        });
    });

    test('an undelivered waybill has no POD fields and no POD link', () => {
        const [status] = nucleusPodStatus.toPodStatuses({ requested: ['SHP-50330075'], rows: [IN_TRANSIT], links: LINKS }).waybills;
        expect(status).toEqual(expect.objectContaining({ delivered: false, podSignedBy: null, podSignedAt: null, podUrl: null, manifestDate: '2026-10-08' }));
        expect(status.trackingUrl).toBe('https://track.example/?wb=SHP-50330075');
    });

    test('keeps the requested order, matches case-insensitively and lists waybills Nucleus left out', () => {
        const result = nucleusPodStatus.toPodStatuses({ requested: ['shp-50330075', 'NOPE-1', 'AON-50330044'], rows: [DELIVERED, IN_TRANSIT], links: LINKS });
        expect(result.waybills.map((w) => w.waybillNumber)).toEqual(['SHP-50330075', 'AON-50330044']);
        expect(result.notFound).toEqual(['NOPE-1']);
    });

    test('gives no links when the connection has no URLs', () => {
        const [status] = nucleusPodStatus.toPodStatuses({ requested: ['AON-50330044'], rows: [DELIVERED], links: {} }).waybills;
        expect(status.trackingUrl).toBeNull();
        expect(status.podUrl).toBeNull();
    });

    test('a POD date without a time is read as midnight SAST', () => {
        const [status] = nucleusPodStatus.toPodStatuses({ requested: ['AON-50330044'], rows: [{ ...DELIVERED, Time: null }], links: {} }).waybills;
        expect(status.podSignedAt).toBe('2026-10-12T00:00:00+02:00');
    });
});

describe('getPodBulkExtra', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('sends a clean waybill list and returns one record per waybill', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[DELIVERED], VALID], OutputParameters: {}, ReturnValue: 0 } });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: 'AON-50330044, NOPE-1' } }), auth };
        const result = await getPodBulkExtra.run(ctx);
        expect(lastRequest().queryParams).toEqual(expect.objectContaining({ waybillnumbers: 'AON-50330044,NOPE-1' }));
        expect(result.ok).toBe(true);
        expect(result.output?.waybills.map((w) => w.waybillNumber)).toEqual(['AON-50330044']);
        expect(result.output?.notFound).toEqual(['NOPE-1']);
    });

    test('treats "Does not Exist" for every waybill as none found, not a failure', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'ERROR - Waybill/s - Does not Exist' }]], OutputParameters: {}, ReturnValue: 0 } });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: 'NOPE-1,NOPE-2' } }), auth };
        const result = await getPodBulkExtra.run(ctx);
        expect(result).toMatchObject({ ok: true, output: { waybills: [], notFound: ['NOPE-1', 'NOPE-2'] } });
    });

    test('other Nucleus errors still fail the step', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[{ ErrorMessage: 'PLEASE PROVIDE A VALID GROUPNAME' }]] } });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: 'AON-1', onFailure: 'continue' } }), auth };
        const result = await getPodBulkExtra.run(ctx);
        expect(result).toMatchObject({ ok: false, error: { message: 'Nucleus error: PLEASE PROVIDE A VALID GROUPNAME' } });
    });

    test('fails before calling Nucleus when the list has no waybill numbers', async () => {
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: ' , ', onFailure: 'continue' } }), auth };
        const result = await getPodBulkExtra.run(ctx);
        expect(result).toMatchObject({ ok: false, error: { message: 'Provide at least one waybill number' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });
});

describe('getPodBulk', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('sends a clean waybill list', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        sendRequest.mockResolvedValueOnce({ status: 200, body: { ResultSets: [[], VALID] } });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNumbers: 'W1, W2' } }), auth };
        await getPodBulk.run(ctx);
        expect(lastRequest().queryParams).toEqual(expect.objectContaining({ waybillnumbers: 'W1,W2' }));
    });
});

describe('createWaybillImportHeader', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('adds the tracking link for the booked waybill to the Nucleus response', async () => {
        sendRequest.mockResolvedValueOnce(TOKEN_RESPONSE);
        const nucleusBody = { ResultSets: [[{ SuccessMessage: 'OK - created' }]], OutputParameters: {}, ReturnValue: 0 };
        sendRequest.mockResolvedValueOnce({ status: 200, body: nucleusBody });
        const propsValue = {
            waybillNo: 'AON-1', waybillDate: '2026/10/13', servCode: 'ECO', noParcels: 1, weight: 1,
            accName: 'S', accTelNo: '0', accNum: 'A', origCode: 'CPT', accAddress1: '', accAddress2: '', accAddress3: '', accAddress4: '', accPostalCode: '',
            destName: 'R', contactName: 'C', contactTelNo: '0', destCode: 'JNB', destAddress1: '', destAddress2: '', destAddress3: '', destAddress4: '', destPostalCode: '',
        };
        const result = await createWaybillImportHeader.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result.output).toEqual({ ...nucleusBody, trackingUrl: 'https://track.example/?wb=AON-1' });
    });
});
