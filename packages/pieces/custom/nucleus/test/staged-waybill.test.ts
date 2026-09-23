/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { createWaybillImportHeader } from '../src/lib/actions/create-waybill-import-header';
import { createWaybillImportDimsAndDetail } from '../src/lib/actions/create-waybill-import-dims-and-detail';
import { nucleusParcels } from '../src/lib/parcels';

const auth = { props: { baseUrl: 'https://api/', username: 'u', password: 'p', groupName: 'G' } };

function lastRequest() {
    return sendRequest.mock.calls[sendRequest.mock.calls.length - 1][0];
}

describe('createWaybillImportHeader', () => {
    beforeEach(() => sendRequest.mockReset());

    test('POSTs CreateWaybillImportHeader with mapped query params, sending blank optionals as empty values', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: 'OK' });
        const propsValue = {
            waybillNo: 'W1', waybillDate: '2026/09/23', servCode: 'ECO', noParcels: 2, weight: 4.5,
            accName: 'Sender', accTelNo: '010', accNum: 'ACC1', origCode: 'JNB',
            accAddress1: 'a1', accAddress2: 'a2', accAddress3: 'a3', accAddress4: 'a4', accPostalCode: '0083',
            destName: 'Recv', contactName: 'Bob', contactTelNo: '011', destCode: 'DBN',
            destAddress1: 'd1', destAddress2: 'd2', destAddress3: 'd3', destAddress4: 'd4', destPostalCode: '0184',
            customerPONumber: 'PO123', reference: '',
        };
        const ctx = { ...createMockActionContext({ propsValue }), auth };
        await createWaybillImportHeader.run(ctx);
        const req = lastRequest();
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://api/CreateWaybillImportHeader');
        expect(req.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer TOK' }));
        expect(req.queryParams).toEqual(expect.objectContaining({
            WaybillNo: 'W1', WaybillNoDate: '2026/09/23', Serv_Code: 'ECO', NoParcels: '2', Weight: '4.5',
            Acc_TelNo: '010', Orig_Code: 'JNB', Acc_Address01: 'a1', Acc_PostalCode: '0083',
            Dest_Code: 'DBN', Dest_Address04: 'd4', CustomerPONumber: 'PO123', GroupName: 'G',
        }));
        expect(req.queryParams).toEqual(expect.objectContaining({
            Reference: '', Dest_AccNum: '', AccNum2: '', Route_Code: '', Cost_Centre: '', Instruct: '', Carrier: '', Filename: '',
        }));
    });
});

describe('createWaybillImportDimsAndDetail', () => {
    beforeEach(() => sendRequest.mockReset());

    test('POSTs CreateWaybillImportDimsAndDetail with parcels packed into parallel arrays', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: 'OK' });
        const propsValue = {
            waybillNo: 'W1',
            parcels: [
                { parcelNo: 'W1/001', items: 1, length: 16, width: 7, height: 4, kgs: 5 },
                { parcelNo: 'W1/002', items: 2, length: 8, width: 6, height: 3, kgs: 5 },
            ],
        };
        const ctx = { ...createMockActionContext({ propsValue }), auth };
        await createWaybillImportDimsAndDetail.run(ctx);
        const req = lastRequest();
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://api/CreateWaybillImportDimsAndDetail');
        expect(req.queryParams).toEqual({
            WaybillNo: 'W1', ParcelNos: 'W1/001,W1/002', PcsCount: '2', Items: '1,2',
            Length: '16,8', Width: '7,6', Height: '4,3', Kgs: '5,5', ItemCode: '', FileName: '', Status: '', GroupName: 'G',
        });
    });
});

describe('packImportParcels', () => {
    test('sends an empty ParcelNos when no parcel numbers are given', () => {
        const parcels = nucleusParcels.parseImportParcels([{ items: 1, length: 1, width: 2, height: 3, kgs: '4' }]);
        expect(nucleusParcels.packImportParcels(parcels)).toEqual({
            PcsCount: '1', Items: '1', Length: '1', Width: '2', Height: '3', Kgs: '4', ParcelNos: '',
        });
    });

    test('rejects a partial parcel-number list that would misalign the arrays', () => {
        const parcels = nucleusParcels.parseImportParcels([
            { parcelNo: 'W1/001', items: 1, length: 1, width: 1, height: 1, kgs: 1 },
            { items: 1, length: 1, width: 1, height: 1, kgs: 1 },
        ]);
        expect(() => nucleusParcels.packImportParcels(parcels)).toThrow('every parcel or on none');
    });

    test('rejects non-numeric dimensions', () => {
        expect(() => nucleusParcels.parseImportParcels([{ items: 1, length: 'abc', width: 1, height: 1, kgs: 1 }])).toThrow('Length must be a number');
    });
});
