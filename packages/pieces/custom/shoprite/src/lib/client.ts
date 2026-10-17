import { HttpMethod } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
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

async function call<T>({ trace, auth, method, path, body, query, headers }: CallParams): Promise<T> {
    const response = await trace.send<T>({
        request: {
            method,
            url: joinUrl(auth.baseUrl, path),
            headers: { ...buildHeaders(auth), ...headers },
            queryParams: query,
            body,
        },
    });
    return response.body;
}

// The Authentication header carries the base64 credentials on their own, so that form must be scrubbed too.
function secretsOf(auth: ShopriteAuth): string[] {
    return [auth.password, Buffer.from(`${auth.username}:${auth.password}`).toString('base64')];
}

export const shopriteClient = { buildHeaders, joinUrl, call, secretsOf };

type CallParams = {
    trace: Tracer;
    auth: ShopriteAuth;
    method: HttpMethod;
    path: string;
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
};
