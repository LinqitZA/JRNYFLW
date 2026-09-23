import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { nucleusParcels } from '../parcels';

export const createWaybillImportDimsAndDetail = createAction({
    auth: nucleusAuth,
    name: 'create_waybill_import_dims_and_detail',
    displayName: 'Add Staged Waybill Parcels (Import Dims & Detail)',
    description:
        'Add parcel dimensions to a waybill staged with "Create Staged Waybill (Import Header)" (CreateWaybillImportDimsAndDetail).',
    props: {
        waybillNo: Property.ShortText({
            displayName: 'Waybill Number',
            description: 'The waybill number used in the Import Header call.',
            required: true,
        }),
        itemCode: Property.ShortText({ displayName: 'Item Code', required: false }),
        parcels: Property.Array({
            displayName: 'Parcels',
            required: true,
            properties: {
                parcelNo: Property.ShortText({
                    displayName: 'Parcel No',
                    description: 'Optional, e.g. WAYBILL001/001.',
                    required: false,
                }),
                items: Property.Number({ displayName: 'Items in Parcel', required: true }),
                length: Property.Number({ displayName: 'Length (cm)', required: true }),
                width: Property.Number({ displayName: 'Width (cm)', required: true }),
                height: Property.Number({ displayName: 'Height (cm)', required: true }),
                kgs: Property.Number({ displayName: 'Weight (kg)', required: true }),
            },
        }),
    },
    async run(context) {
        const p = context.propsValue;
        const parcels = nucleusParcels.parseImportParcels(p.parcels ?? []);
        const query: Record<string, string> = {
            WaybillNo: p.waybillNo,
            ...nucleusParcels.packImportParcels(parcels),
            ItemCode: p.itemCode ?? '',
            FileName: '',
            Status: '',
        };
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.POST,
            path: 'CreateWaybillImportDimsAndDetail',
            query,
        });
    },
});
