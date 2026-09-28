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

    test('POSTs CreateWaybillImportHeader with mapped query params, a comma decimal weight and blank optionals as empty values', async () => {
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
            WaybillNo: 'W1', WaybillNoDate: '2026/09/23', Serv_Code: 'ECO', NoParcels: '2', Weight: '4,5',
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

const JRNY_CARTONS = [
    { barcode: 'CTN-AON-000032', widthCm: 10, heightCm: 10, lengthCm: 10, cartonSeq: 1, itemCount: 1, unitsPacked: 2, tareWeightKg: 0, grossWeightKg: 1, volumetricWeightKg: 0.2 },
    { barcode: 'CTN-AON-000033', widthCm: 12, heightCm: 10, lengthCm: 15, cartonSeq: 2, itemCount: 1, unitsPacked: 2, tareWeightKg: 0, grossWeightKg: 0.5, volumetricWeightKg: 0.36 },
];

describe('JRNY webhook inputs', () => {
    beforeEach(() => sendRequest.mockReset());

    test('header converts a YYYY-MM-DD waybill date to YYYY/MM/DD', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: 'OK' });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNo: 'W1', waybillDate: '2026-09-28', noParcels: 1, weight: 1 } }), auth };
        await createWaybillImportHeader.run(ctx);
        expect(lastRequest().queryParams.WaybillNoDate).toBe('2026/09/28');
    });

    test('dims maps a JRNY cartons array, using unitsPacked for Items by default', async () => {
        sendRequest.mockResolvedValueOnce({ body: { access_token: 'TOK', expires_in: 3599 } });
        sendRequest.mockResolvedValueOnce({ body: 'OK' });
        const ctx = { ...createMockActionContext({ propsValue: { waybillNo: 'W1', cartonsJson: JRNY_CARTONS } }), auth };
        await createWaybillImportDimsAndDetail.run(ctx);
        expect(lastRequest().queryParams).toEqual(expect.objectContaining({
            ParcelNos: 'CTN-AON-000032,CTN-AON-000033', PcsCount: '2', Items: '2,2',
            Length: '10,15', Width: '10,12', Height: '10,10', Kgs: '1,0.5',
        }));
    });

    test('dims can take Items from itemCount and accepts the cartons as a JSON string', () => {
        const parcels = nucleusParcels.parseJrnyCartons({ value: JSON.stringify(JRNY_CARTONS), itemsField: 'itemCount' });
        expect(nucleusParcels.packImportParcels(parcels).Items).toBe('1,1');
    });

    test('dims rejects both Cartons (JSON) and Parcels at once', async () => {
        const propsValue = { waybillNo: 'W1', cartonsJson: JRNY_CARTONS, parcels: [{ items: 1, length: 1, width: 1, height: 1, kgs: 1 }] };
        await expect(createWaybillImportDimsAndDetail.run({ ...createMockActionContext({ propsValue }), auth })).rejects.toThrow('not both');
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('dims reports which carton field is missing', () => {
        expect(() => nucleusParcels.parseJrnyCartons({ value: [{ barcode: 'C1', unitsPacked: 1, lengthCm: 1, widthCm: 1, heightCm: 1 }], itemsField: 'unitsPacked' }))
            .toThrow('Parcel 1: Weight must be a number');
    });
});
