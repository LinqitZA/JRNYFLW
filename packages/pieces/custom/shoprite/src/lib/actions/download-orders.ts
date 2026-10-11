import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const downloadOrders = createAction({
    auth: shopriteAuth,
    name: 'download_orders',
    displayName: 'Download Orders',
    description: 'Download new (un-acknowledged) orders for the vendor (GS1 OrderMessageType).',
    props: {
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) => shopriteClient.call({ trace, auth, method: HttpMethod.GET, path: '/api/VendorOrder' }),
        });
    },
});
