import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { nucleusPodStatus } from '../pod-status';

export const getPodBulk = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk',
    displayName: 'Get PODs (Bulk)',
    description: 'Fetch proof-of-delivery info (incl. GRN) for one or more waybills.',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers', description: 'Separated by commas, spaces or new lines.', required: true }),
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
                    path: 'GetPODInformation_Bulk',
                    query: { waybillnumbers: nucleusPodStatus.parseWaybillList(context.propsValue.waybillNumbers).join(',') },
                }),
        });
    },
});
