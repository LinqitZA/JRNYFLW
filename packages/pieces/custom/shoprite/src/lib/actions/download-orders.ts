import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { gs1Orders } from '../gs1-orders';

export const downloadOrders = createAction({
    auth: shopriteAuth,
    name: 'download_orders',
    displayName: 'Download Orders',
    description: 'Download new (un-acknowledged) orders as plain orders: store, delivery date, and lines with item codes, GTIN, quantity and prices. Downloading does not acknowledge them.',
    props: {
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: async (trace) =>
                gs1Orders.parse(await shopriteClient.call<unknown>({ trace, auth, method: HttpMethod.GET, path: '/api/VendorOrder' })),
        });
    },
});
