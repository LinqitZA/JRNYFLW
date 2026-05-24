import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { jrnyAuth } from './lib/auth';
import { jrnyOperations } from './lib/operations';
import { buildJrnyAction } from './lib/action-factory';
import { createQuote } from './lib/actions/create-quote';
import { customApiCall } from './lib/actions/custom-api-call';

const generatedActions = jrnyOperations
  .filter((op) => op.name !== 'create_quotation')
  .map(buildJrnyAction);

export const jrny = createPiece({
  displayName: 'JRNY',
  description:
    'JRNY ERP integration — full Integration API coverage (sales, customers, products, procurement, finance, pricing, shipping, admin).',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
  authors: ['jrnyflw'],
  categories: [PieceCategory.SALES_AND_CRM, PieceCategory.ACCOUNTING],
  auth: jrnyAuth,
  actions: [createQuote, ...generatedActions, customApiCall],
  triggers: [],
});
