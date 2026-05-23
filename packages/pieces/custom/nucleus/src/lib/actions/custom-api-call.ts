import { createCustomApiCallAction, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const customApiCall = createCustomApiCallAction({
    auth: nucleusAuth,
    baseUrl: (auth) => auth?.props.baseUrl ?? '',
    authMapping: async (auth) => {
        const res = await httpClient.sendRequest<{ access_token: string }>({
            method: HttpMethod.POST,
            url: nucleusClient.joinUrl(auth.props.baseUrl, '/token'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(auth.props.username)}&password=${encodeURIComponent(auth.props.password)}&grant_type=password`,
        });
        return { Authorization: `Bearer ${res.body.access_token}` };
    },
});
