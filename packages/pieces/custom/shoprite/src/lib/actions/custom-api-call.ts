import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';

export const customApiCall = createCustomApiCallAction({
    auth: shopriteAuth,
    baseUrl: (auth) => auth?.props.baseUrl ?? '',
    authMapping: async (auth) => {
        const { username, password, contractId } = auth.props;
        const b64 = Buffer.from(`${username}:${password}`).toString('base64');
        return {
            Authorization: `Basic ${b64}`,
            Authentication: b64,
            ContractID: contractId,
            UIUser: username,
        };
    },
});
