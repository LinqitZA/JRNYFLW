import { HttpMethod } from '@activepieces/pieces-common';
import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalClient } from './client';

export const aonPortalAuth = PieceAuth.CustomAuth({
    description: 'Connect to an AON customer portal (for example https://shoprite.accessoffice.co.za). The portal team provides the API key.',
    required: true,
    props: {
        portalUrl: Property.ShortText({ displayName: 'Portal URL', description: 'For example https://shoprite.accessoffice.co.za', required: true }),
        apiKey: PieceAuth.SecretText({ displayName: 'API Key', required: true }),
    },
    validate: async ({ auth }) => {
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: aonPortalClient.secretsOf(auth),
            work: (trace) => aonPortalClient.call({ trace, auth, method: HttpMethod.GET, path: ORDERS_PATH, query: { status: 'processing', limit: '1' } }),
        });
        if (result.ok) {
            return { valid: true };
        }
        if (result.error.status === 401) {
            return { valid: false, error: 'The portal rejected this API key' };
        }
        return { valid: false, error: `Could not reach the portal: ${result.error.message}` };
    },
});

const ORDERS_PATH = '/api/erp/orders';

export type AonPortalAuth = { portalUrl: string; apiKey: string };
