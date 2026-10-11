import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const getPodBulkExtra = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk_extra',
    displayName: 'Get PODs Extra (Bulk)',
    description: 'Fetch extended proof-of-delivery info for one or more waybills (GetPODInformation_Bulk_Extra).',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers (comma-separated)', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.GET,
                    path: 'GetPODInformation_Bulk_Extra',
                    query: { waybillnumbers: context.propsValue.waybillNumbers },
                }),
        });
    },
});
