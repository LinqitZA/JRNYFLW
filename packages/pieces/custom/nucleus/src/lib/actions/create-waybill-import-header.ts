import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const createWaybillImportHeader = createAction({
    auth: nucleusAuth,
    name: 'create_waybill_import_header',
    displayName: 'Create Staged Waybill (Import Header)',
    description:
        'Stage a waybill header for track-and-trace (CreateWaybillImportHeader). Follow with "Add Staged Waybill Parcels (Import Dims & Detail)" for the same waybill number.',
    props: {
        waybillNo: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        waybillDate: Property.ShortText({
            displayName: 'Waybill Date',
            description: 'YYYY/MM/DD. YYYY-MM-DD and ISO timestamps are converted automatically.',
            required: true,
        }),
        servCode: Property.ShortText({
            displayName: 'Service Code',
            description: 'From Get Service Codes (e.g. ECO, ONX).',
            required: true,
        }),
        noParcels: Property.Number({ displayName: 'Total Parcels', required: true }),
        weight: Property.Number({ displayName: 'Total Weight (kg)', required: true }),
        accName: Property.ShortText({ displayName: 'Sender Name', required: true }),
        accTelNo: Property.ShortText({ displayName: 'Sender Tel', required: true }),
        accNum: Property.ShortText({
            displayName: 'Sender Account Number',
            description: 'Sender account number in Winfreight.',
            required: true,
        }),
        origCode: Property.ShortText({
            displayName: 'Sender Hub Code',
            description: 'From Get Hub Codes (e.g. JNB).',
            required: true,
        }),
        accAddress1: Property.ShortText({ displayName: 'Sender Address 1', required: true }),
        accAddress2: Property.ShortText({ displayName: 'Sender Address 2', required: true }),
        accAddress3: Property.ShortText({ displayName: 'Sender Address 3', required: true }),
        accAddress4: Property.ShortText({ displayName: 'Sender Address 4', required: true }),
        accPostalCode: Property.ShortText({ displayName: 'Sender Postal Code', required: true }),
        destName: Property.ShortText({ displayName: 'Receiver Name', required: true }),
        contactName: Property.ShortText({ displayName: 'Receiver Contact Person', required: true }),
        contactTelNo: Property.ShortText({ displayName: 'Receiver Contact Tel', required: true }),
        destAccNum: Property.ShortText({
            displayName: 'Receiver Account Number',
            description: 'Receiver account number in Winfreight, if the receiver has one.',
            required: false,
        }),
        destCode: Property.ShortText({
            displayName: 'Receiver Hub Code',
            description: 'From Get Hub Codes (e.g. DBN).',
            required: true,
        }),
        destAddress1: Property.ShortText({ displayName: 'Receiver Address 1', required: true }),
        destAddress2: Property.ShortText({ displayName: 'Receiver Address 2', required: true }),
        destAddress3: Property.ShortText({ displayName: 'Receiver Address 3', required: true }),
        destAddress4: Property.ShortText({ displayName: 'Receiver Address 4', required: true }),
        destPostalCode: Property.ShortText({ displayName: 'Receiver Postal Code', required: true }),
        customerPONumber: Property.ShortText({ displayName: 'Customer PO Number', required: false }),
        reference: Property.ShortText({ displayName: 'Reference', required: false }),
        instruct: Property.ShortText({ displayName: 'Instructions', required: false }),
        costCentre: Property.ShortText({ displayName: 'Cost Centre', required: false }),
        routeCode: Property.ShortText({ displayName: 'Route Code', required: false }),
        carrier: Property.ShortText({ displayName: 'Carrier', required: false }),
        accNum2: Property.ShortText({ displayName: 'Account Number 2', required: false }),
        filename: Property.ShortText({ displayName: 'Filename', required: false }),
    },
    async run(context) {
        const p = context.propsValue;
        const query: Record<string, string> = {
            WaybillNo: p.waybillNo,
            WaybillNoDate: toNucleusDate(p.waybillDate),
            Serv_Code: p.servCode,
            NoParcels: String(p.noParcels),
            Weight: toNucleusDecimal(p.weight),
            AccName: p.accName,
            Acc_TelNo: p.accTelNo,
            AccNum: p.accNum,
            Orig_Code: p.origCode,
            Acc_Address01: p.accAddress1,
            Acc_Address02: p.accAddress2,
            Acc_Address03: p.accAddress3,
            Acc_Address04: p.accAddress4,
            Acc_PostalCode: p.accPostalCode,
            Dest_Name: p.destName,
            Contact_Name: p.contactName,
            Contact_TelNo: p.contactTelNo,
            Dest_Code: p.destCode,
            Dest_Address01: p.destAddress1,
            Dest_Address02: p.destAddress2,
            Dest_Address03: p.destAddress3,
            Dest_Address04: p.destAddress4,
            Dest_PostalCode: p.destPostalCode,
            ...always('Dest_AccNum', p.destAccNum),
            ...always('CustomerPONumber', p.customerPONumber),
            ...always('Reference', p.reference),
            ...always('Instruct', p.instruct),
            ...always('Cost_Centre', p.costCentre),
            ...always('Route_Code', p.routeCode),
            ...always('Carrier', p.carrier),
            ...always('AccNum2', p.accNum2),
            ...always('Filename', p.filename),
        };
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.POST,
            path: 'CreateWaybillImportHeader',
            query,
        });
    },
});

// Nucleus parses decimals with the server's South African culture, so "1.5" fails with "Failed to convert parameter value from a String to a Double".
function toNucleusDecimal(value: number): string {
    return String(value).replace('.', ',');
}

function toNucleusDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    return match ? `${match[1]}/${match[2]}/${match[3]}` : value.trim();
}

// stp_CreateWaybillImportHeader declares these "optional" fields without defaults, so omitting one fails with "expects parameter ... which was not supplied".
function always(key: string, value: string | undefined): Record<string, string> {
    return { [key]: value ?? '' };
}
