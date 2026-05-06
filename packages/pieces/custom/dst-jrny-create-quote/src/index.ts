import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { jrnyAuth } from './lib/auth';
import { createQuote } from './lib/actions/create-quote';

export const jrnyCreateQuoteSegment = createPiece({
  displayName: 'JRNY — Create Quote',
  description:
    'Create a quotation in a JRNY ERP entity. Resolves customer, stock, pricing, tax, and UOM through the live JRNY services. Optionally auto-converts to a draft sales order.',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
  authors: ['jrnyflw'],
  categories: [PieceCategory.SALES_AND_CRM],
  auth: jrnyAuth,
  actions: [createQuote],
  triggers: [],
});
