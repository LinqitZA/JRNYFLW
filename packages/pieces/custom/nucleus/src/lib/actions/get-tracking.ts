import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const getTracking = createAction({
    auth: nucleusAuth,
    name: 'get_tracking',
    displayName: 'Get Tracking',
    description: 'Fetch the tracking events for a single waybill.',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetTracking', query: { Waybill: context.propsValue.waybill } }),
        });
    },
});
