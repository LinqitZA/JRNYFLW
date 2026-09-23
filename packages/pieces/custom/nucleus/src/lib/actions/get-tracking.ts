import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getTracking = createAction({
    auth: nucleusAuth,
    name: 'get_tracking',
    displayName: 'Get Tracking',
    description: 'Fetch the tracking events for a single waybill.',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
    },
    async run(context) {
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.GET,
            path: 'GetTracking',
            query: { Waybill: context.propsValue.waybill },
        });
    },
});
