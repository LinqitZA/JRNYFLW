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
import { generatePick } from './lib/actions/generate-pick';
import { listInvoicesReady } from './lib/actions/list-invoices-ready';
import { recordInvoiceResult } from './lib/actions/record-invoice-result';

const CURATED = ['create_quotation', 'courier_response', 'generate_pick'];
const generatedActions = jrnyOperations.filter((op) => !CURATED.includes(op.name)).map(buildJrnyAction);

export const jrny = createPiece({
  displayName: 'JRNY',
  description:
    'JRNY ERP integration — full Integration API coverage (sales, customers, products, procurement, finance, pricing, shipping, admin).',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
  authors: ['jrnyflw'],
  categories: [PieceCategory.SALES_AND_CRM, PieceCategory.ACCOUNTING],
  auth: jrnyAuth,
  actions: [createQuote, courierResponse, listCourierDispatches, resolveOrderLines, generatePick, listInvoicesReady, recordInvoiceResult, ...generatedActions, customApiCall],
  triggers: [],
});
