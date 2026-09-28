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
        cartonsJson: Property.Json({
            displayName: 'Cartons (JSON)',
            description:
                'The JRNY cartons array, e.g. the webhook\'s data.cartons. Maps barcode, lengthCm, widthCm, heightCm and grossWeightKg. Use this or Parcels, not both.',
            required: false,
        }),
        itemsField: Property.StaticDropdown({
            displayName: 'Items per Carton From',
            description: 'Which JRNY carton field fills Nucleus "Items" when using Cartons (JSON).',
            required: false,
            defaultValue: 'unitsPacked',
            options: {
                options: [
                    { label: 'Units packed (unitsPacked)', value: 'unitsPacked' },
                    { label: 'Item count (itemCount)', value: 'itemCount' },
                ],
            },
        }),
        parcels: Property.Array({
            displayName: 'Parcels',
            description: 'Enter parcels one by one. Use this or Cartons (JSON), not both.',
            required: false,
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
        const parcels = resolveParcels({ cartonsJson: p.cartonsJson, itemsField: p.itemsField, parcels: p.parcels });
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

function resolveParcels({
    cartonsJson,
    itemsField,
    parcels,
}: {
    cartonsJson: unknown;
    itemsField: string | undefined;
    parcels: unknown[] | undefined;
}) {
    const hasCartons = !isEmpty(cartonsJson);
    const hasParcels = (parcels ?? []).length > 0;
    if (hasCartons && hasParcels) {
        throw new Error('Use either Cartons (JSON) or Parcels, not both');
    }
    if (hasCartons) {
        return nucleusParcels.parseJrnyCartons({ value: cartonsJson, itemsField: itemsField === 'itemCount' ? 'itemCount' : 'unitsPacked' });
    }
    return nucleusParcels.parseImportParcels(parcels ?? []);
}

function isEmpty(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
        return true;
    }
    return typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}
