import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { aonPortalAuth } from '../auth';

export const customApiCall = createCustomApiCallAction({
    auth: aonPortalAuth,
    baseUrl: (auth) => (auth?.props.portalUrl ?? '').trim().replace(/\/+$/, ''),
    authMapping: async (auth) => ({ 'X-API-Key': auth.props.apiKey }),
});
