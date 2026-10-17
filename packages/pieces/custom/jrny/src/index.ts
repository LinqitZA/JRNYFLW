import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { jrnyAuth } from './lib/auth';
import { jrnyOperations } from './lib/operations';
import { buildJrnyAction } from './lib/action-factory';
import { createQuote } from './lib/actions/create-quote';
import { courierResponse } from './lib/actions/courier-response';
import { customApiCall } from './lib/actions/custom-api-call';
import { listCourierDispatches } from './lib/actions/list-courier-dispatches';
import { resolveOrderLines } from './lib/actions/resolve-order-lines';

const generatedActions = jrnyOperations
  .filter((op) => op.name !== 'create_quotation' && op.name !== 'courier_response')
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
  actions: [createQuote, courierResponse, listCourierDispatches, resolveOrderLines, ...generatedActions, customApiCall],
  triggers: [],
});
