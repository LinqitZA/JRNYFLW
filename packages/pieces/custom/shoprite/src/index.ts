import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { shopriteAuth } from './lib/auth';

export const shoprite = createPiece({
    displayName: 'Shoprite',
    description: 'Shoprite B2B Supplier Services (GS1 eCom) — download orders, acknowledge, and upload invoices.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: shopriteAuth,
    actions: [],
    triggers: [],
});
