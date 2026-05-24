import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { jrnyAuth } from '../auth';

export const customApiCall = createCustomApiCallAction({
    auth: jrnyAuth,
    baseUrl: (auth) => auth?.props.baseUrl ?? '',
    authMapping: async (auth) => ({ Authorization: `Bearer ${auth.props.bearerToken}` }),
});
