import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

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
    },
    async run(context) {
        const action = encodeURIComponent(context.propsValue.action);
        return shopriteClient.call(context.auth.props, HttpMethod.PUT, `/api/VendorOrder/${action}`);
    },
});
