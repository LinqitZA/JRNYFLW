import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getLabel = createAction({
    auth: nucleusAuth,
    name: 'get_label',
    displayName: 'Get Label',
    description: 'Fetch label information for a waybill (optionally a single parcel).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill', required: true }),
        parcel: Property.ShortText({ displayName: 'Parcel (optional)', required: false }),
    },
    async run(context) {
        const query: Record<string, string> = { Waybill: context.propsValue.waybill };
        if (context.propsValue.parcel) query['Parcel'] = context.propsValue.parcel;
        return nucleusClient.call({ auth: context.auth.props, store: context.store, method: HttpMethod.GET, path: 'GetLabel', query });
    },
});
