import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { msGraphMailAuth } from '../auth';
import { msGraphClient, MsGraphMailAuth } from '../client';

export const customApiCall = createCustomApiCallAction({
    auth: msGraphMailAuth,
    baseUrl: () => msGraphClient.graphBaseUrl,
    authMapping: graphCustomApiAuth,
});

export async function graphCustomApiAuth(auth: { props: MsGraphMailAuth }): Promise<Record<string, string>> {
    const token = await msGraphClient.getUntracedToken({ auth: auth.props });
    return { Authorization: `Bearer ${token}` };
}
