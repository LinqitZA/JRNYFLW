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
            return aonPortalClient.isOrderPage(result.output) ? { valid: true } : { valid: false, error: 'The Portal URL does not point at an AON portal API' };
        }
        if (result.error.status !== null && KEY_REJECTED.includes(result.error.status)) {
            return { valid: false, error: 'The portal rejected this API key' };
        }
        return { valid: false, error: `Could not reach the portal: ${result.error.message}` };
    },
});

const ORDERS_PATH = '/api/erp/orders';
// The portal answers a missing key with 401 and a wrong key with 403.
const KEY_REJECTED = [401, 403];

export type AonPortalAuth = { portalUrl: string; apiKey: string };
