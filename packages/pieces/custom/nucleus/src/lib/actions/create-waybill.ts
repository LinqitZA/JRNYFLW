import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { nucleusParcels } from '../parcels';

export const createWaybill = createAction({
    auth: nucleusAuth,
    name: 'create_waybill',
    displayName: 'Create Waybill',
    description: 'Create a live waybill with parcel dimensions in one call (CreateWaybill_Inhouse).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        dateWay: Property.ShortText({ displayName: 'Waybill Date (YYYY/MM/DD)', required: true }),
        branch: Property.ShortText({ displayName: 'Branch Code', required: true }),
        accNum: Property.ShortText({ displayName: 'Account Number', required: true }),
        servC: Property.ShortText({ displayName: 'Service Code', required: true }),
        custName: Property.ShortText({ displayName: 'Customer Name', required: true }),
        shipName: Property.ShortText({ displayName: 'Shipper Name', required: true }),
        shipTel: Property.ShortText({ displayName: 'Shipper Tel', required: false }),
        shipAddr1: Property.ShortText({ displayName: 'Shipper Address 1', required: false }),
        shipAddr2: Property.ShortText({ displayName: 'Shipper Address 2', required: false }),
        shipAddr3: Property.ShortText({ displayName: 'Shipper Address 3', required: false }),
        shipAddr4: Property.ShortText({ displayName: 'Shipper Address 4', required: false }),
        sendArea: Property.ShortText({ displayName: 'Sender Area Code', required: false }),
        consigName: Property.ShortText({ displayName: 'Consignee Name', required: true }),
        conName: Property.ShortText({ displayName: 'Consignee Contact', required: false }),
        conTel: Property.ShortText({ displayName: 'Consignee Tel', required: false }),
        conAddr1: Property.ShortText({ displayName: 'Consignee Address 1', required: false }),
        conAddr2: Property.ShortText({ displayName: 'Consignee Address 2', required: false }),
        conAddr3: Property.ShortText({ displayName: 'Consignee Address 3', required: false }),
        conAddr4: Property.ShortText({ displayName: 'Consignee Address 4', required: false }),
        destArea: Property.ShortText({ displayName: 'Destination Area Code', required: false }),
        reference: Property.ShortText({ displayName: 'Reference', required: false }),
        massKg: Property.ShortText({ displayName: 'Total Mass (kg)', required: false }),
        parcels: Property.Array({
            displayName: 'Parcels',
            required: true,
            properties: {
                parcelNo: Property.ShortText({ displayName: 'Parcel No', required: true }),
                items: Property.Number({ displayName: 'Items', required: true }),
                length: Property.Number({ displayName: 'Length', required: true }),
                width: Property.Number({ displayName: 'Width', required: true }),
                height: Property.Number({ displayName: 'Height', required: true }),
                weight: Property.Number({ displayName: 'Weight', required: true }),
            },
        }),
    },
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        const parcels = (p.parcels ?? []) as Array<{ parcelNo: string; items: number; length: number; width: number; height: number; weight: number }>;
        const packed = nucleusParcels.packParcels(parcels);
        const query: Record<string, string> = {
            WAYBILL: p.waybill,
            DATEWAY: p.dateWay,
            BRANCH: p.branch,
            ACCNUM: p.accNum,
            SERV_C: p.servC,
            CUSTNAME: p.custName,
            SHIPNAME: p.shipName,
            CONSIGNAME: p.consigName,
            ...packed,
            ...spread('SHIPTELNO', p.shipTel),
            ...spread('SHIPADRES1', p.shipAddr1),
            ...spread('SHIPADRES2', p.shipAddr2),
            ...spread('SHIPADRES3', p.shipAddr3),
            ...spread('SHIPADRES4', p.shipAddr4),
            ...spread('SENDAREA', p.sendArea),
            ...spread('CONNAME', p.conName),
            ...spread('CONTELNO', p.conTel),
            ...spread('CONADDR1', p.conAddr1),
            ...spread('CONADDR2', p.conAddr2),
            ...spread('CONADDR3', p.conAddr3),
            ...spread('CONADDR4', p.conAddr4),
            ...spread('DESTAREA', p.destArea),
            ...spread('REFNUM', p.reference),
            ...spread('MASSKG', p.massKg),
        };
        return nucleusClient.call({ auth, store: context.store, method: HttpMethod.POST, path: 'CreateWaybill_Inhouse', query });
    },
});

function spread(key: string, value: string | undefined): Record<string, string> {
    return value === undefined || value === '' ? {} : { [key]: value };
}
