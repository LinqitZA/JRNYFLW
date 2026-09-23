import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getPodBulkExtra = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk_extra',
    displayName: 'Get PODs Extra (Bulk)',
    description: 'Fetch extended proof-of-delivery info for one or more waybills (GetPODInformation_Bulk_Extra).',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers (comma-separated)', required: true }),
    },
    async run(context) {
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.GET,
            path: 'GetPODInformation_Bulk_Extra',
            query: { waybillnumbers: context.propsValue.waybillNumbers },
        });
    },
});
