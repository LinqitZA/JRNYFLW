import { PieceAuth, createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { readXlsxRows } from './lib/actions/read-xlsx-rows';

export const excel = createPiece({
  displayName: 'Excel',
  description:
    'Parse .xlsx workbooks into iterable JSON rows. Pair with the core "Loop on Items" step to drive a destination per row.',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/microsoft-excel-365.png',
  authors: ['jrnyflw'],
  categories: [PieceCategory.CONTENT_AND_FILES, PieceCategory.PRODUCTIVITY],
  auth: PieceAuth.None(),
  actions: [readXlsxRows],
  triggers: [],
});
