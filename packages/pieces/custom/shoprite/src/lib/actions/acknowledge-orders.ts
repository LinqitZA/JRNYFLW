import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const acknowledgeOrders = createAction({
    auth: shopriteAuth,
    name: 'acknowledge_orders',
    displayName: 'Acknowledge Orders',
    description: 'Acknowledge (or reset) downloaded orders so they are not returned again. Set the action code as confirmed with Shoprite.',
    props: {
        action: Property.ShortText({
            displayName: 'Action',
            description: 'Acknowledge/reset action code expected by Shoprite (path segment for PUT /api/VendorOrder/{action}).',
            required: true,
            defaultValue: 'Acknowledge',
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) =>
                shopriteClient.call({ trace, auth, method: HttpMethod.PUT, path: `/api/VendorOrder/${encodeURIComponent(context.propsValue.action)}` }),
        });
    },
});
