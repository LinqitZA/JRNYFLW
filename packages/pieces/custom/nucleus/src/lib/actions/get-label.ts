import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const getLabel = createAction({
    auth: nucleusAuth,
    name: 'get_label',
    displayName: 'Get Label',
    description: 'Fetch label information for a waybill (optionally a single parcel).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill', required: true }),
        parcel: Property.ShortText({ displayName: 'Parcel (optional)', required: false }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const query: Record<string, string> = { Waybill: context.propsValue.waybill };
                if (context.propsValue.parcel) query['Parcel'] = context.propsValue.parcel;
                return nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetLabel', query });
            },
        });
    },
});
