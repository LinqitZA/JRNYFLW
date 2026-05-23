import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { shopriteAuth } from './lib/auth';
import { downloadOrders } from './lib/actions/download-orders';
import { acknowledgeOrders } from './lib/actions/acknowledge-orders';
import { uploadInvoice } from './lib/actions/upload-invoice';
import { customApiCall } from './lib/actions/custom-api-call';

export const shoprite = createPiece({
    displayName: 'Shoprite',
    description: 'Shoprite B2B Supplier Services (GS1 eCom) — download orders, acknowledge, and upload invoices.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: shopriteAuth,
    actions: [downloadOrders, acknowledgeOrders, uploadInvoice, customApiCall],
    triggers: [],
});
