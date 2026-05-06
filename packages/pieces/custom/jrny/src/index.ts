import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { jrnyAuth } from './lib/auth';
import { createQuote } from './lib/actions/create-quote';

export const jrny = createPiece({
  displayName: 'JRNY',
  description:
    'JRNY ERP integration. Per-connection bearer auth scoped to a single JRNY entity. Destinations resolve customers, stock, pricing, tax, and UOM through the live JRNY services.',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
  authors: ['jrnyflw'],
  categories: [PieceCategory.SALES_AND_CRM, PieceCategory.ACCOUNTING],
  auth: jrnyAuth,
  actions: [createQuote],
  triggers: [],
});
