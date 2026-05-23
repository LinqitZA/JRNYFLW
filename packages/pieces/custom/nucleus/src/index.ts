import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { nucleusAuth } from './lib/auth';

export const nucleus = createPiece({
    displayName: 'Nucleus',
    description: 'Nucleus (Winfreight FMS) courier — create waybills, track shipments, fetch PODs and labels.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: nucleusAuth,
    actions: [],
    triggers: [],
});
