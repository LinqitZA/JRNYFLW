import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { msGraphMailAuth } from './lib/auth';
import { sendEmail } from './lib/actions/send-email';
import { customApiCall } from './lib/actions/custom-api-call';

export const msGraphMail = createPiece({
    displayName: 'MS Graph Mail',
    description: 'Send email from a Microsoft 365 mailbox as an application, through Microsoft Graph.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/microsoft-outlook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.COMMUNICATION],
    auth: msGraphMailAuth,
    actions: [sendEmail, customApiCall],
    triggers: [],
});
