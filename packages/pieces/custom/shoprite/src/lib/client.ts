import { HttpMethod, httpClient } from '@activepieces/pieces-common';
import { ShopriteAuth } from './auth';

function buildHeaders(auth: ShopriteAuth): Record<string, string> {
    const b64 = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return {
        Authorization: `Basic ${b64}`,
        Authentication: b64,
        ContractID: auth.contractId,
        UIUser: auth.username,
    };
}

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function call<T>(auth: ShopriteAuth, method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await httpClient.sendRequest<T>({
        method,
        url: joinUrl(auth.baseUrl, path),
        headers: buildHeaders(auth),
        body,
    });
    return response.body;
}

export const shopriteClient = { buildHeaders, joinUrl, call };
