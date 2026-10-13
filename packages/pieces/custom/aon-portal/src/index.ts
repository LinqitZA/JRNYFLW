import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { aonPortalAuth } from './lib/auth';

export const aonPortal = createPiece({
    displayName: 'AON Customer Portal',
    description: 'AON customer ordering portals: list orders and acknowledge them with the ERP order number.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: aonPortalAuth,
    actions: [],
    triggers: [],
});
