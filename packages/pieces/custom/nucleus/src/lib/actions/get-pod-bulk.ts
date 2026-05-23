import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getPodBulk = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk',
    displayName: 'Get PODs (Bulk)',
    description: 'Fetch proof-of-delivery info (incl. GRN) for one or more waybills.',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers (comma-separated)', required: true }),
    },
    async run(context) {
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.GET,
            path: 'GetPODInformation_Bulk',
            query: { waybillnumbers: context.propsValue.waybillNumbers },
        });
    },
});
