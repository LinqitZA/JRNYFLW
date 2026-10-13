import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalAuth } from '../auth';
import { aonPortalClient } from '../client';

export const acknowledgeOrder = createAction({
    auth: aonPortalAuth,
    name: 'acknowledge_order',
    displayName: 'Acknowledge Order',
    description: "Set the ERP order number on a portal order, which moves it out of processing. Use the order's id, not its orderNumber.",
    props: {
        orderId: Property.ShortText({ displayName: 'Order ID', description: "The order's id (a UUID) from List Orders.", required: true }),
        erpOrderNumber: Property.ShortText({ displayName: 'ERP Order Number', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: aonPortalClient.secretsOf(auth),
            work: async (trace) => {
                const orderId = p.orderId.trim();
                const erpOrderNumber = p.erpOrderNumber.trim();
                // The orderNumber (e.g. 10001) is what people see, so it is the easy mistake; the portal only accepts the id.
                if (!UUID.test(orderId)) {
                    throw new Error("Order ID must be the order's id (a UUID), not its orderNumber");
                }
                if (erpOrderNumber === '') {
                    throw new Error('ERP Order Number is required');
                }
                return aonPortalClient.call<unknown>({
                    trace,
                    auth,
                    method: HttpMethod.PUT,
                    path: `/api/erp/orders/${encodeURIComponent(orderId)}/acknowledge`,
                    body: { erpOrderNumber },
                });
            },
        });
    },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
