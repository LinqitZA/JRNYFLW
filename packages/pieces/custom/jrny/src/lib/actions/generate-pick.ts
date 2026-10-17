import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';

export const generatePick = createAction({
  auth: jrnyAuth,
  name: 'generate_pick',
  displayName: 'Generate Pick',
  description:
    "Creates the picking instruction for a confirmed sales order, with JRNY's own pick rules. A sales order that is not confirmed, or already has a pick, gives a 409 instead of a second pick.",
  props: {
    salesOrderNumber: Property.ShortText({ displayName: 'Sales Order Number', required: true }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const orderNumber = (p.salesOrderNumber ?? '').trim();
        if (orderNumber === '') {
          throw new Error('Sales Order Number is required');
        }
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/sales-orders/${encodeURIComponent(orderNumber)}/generate-pick`;
        return jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.POST, path });
      },
    });
  },
});
