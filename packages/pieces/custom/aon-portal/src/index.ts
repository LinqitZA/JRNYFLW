import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { aonPortalAuth } from './lib/auth';
import { listOrders } from './lib/actions/list-orders';
import { acknowledgeOrder } from './lib/actions/acknowledge-order';
import { customApiCall } from './lib/actions/custom-api-call';

export const aonPortal = createPiece({
    displayName: 'AON Customer Portal',
    description: 'AON customer ordering portals: list orders and acknowledge them with the ERP order number.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: aonPortalAuth,
    actions: [listOrders, acknowledgeOrder, customApiCall],
    triggers: [],
});
