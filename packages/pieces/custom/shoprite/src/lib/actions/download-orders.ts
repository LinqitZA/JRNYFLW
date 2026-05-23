import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

export const downloadOrders = createAction({
    auth: shopriteAuth,
    name: 'download_orders',
    displayName: 'Download Orders',
    description: 'Download new (un-acknowledged) orders for the vendor (GS1 OrderMessageType).',
    props: {},
    async run(context) {
        return shopriteClient.call(context.auth.props, HttpMethod.GET, '/api/VendorOrder');
    },
});
