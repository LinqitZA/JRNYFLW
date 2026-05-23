import { HttpMethod, QueryParams, httpClient } from '@activepieces/pieces-common';
import { NucleusAuth } from './auth';

type CachedToken = { token: string; expiresAt: number };
const TOKEN_STORE_KEY = 'nucleus_token';

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isExpired(cached: CachedToken, nowMs: number): boolean {
    return cached.expiresAt <= nowMs;
}

function isCachedToken(value: unknown): value is CachedToken {
    return (
        typeof value === 'object' &&
        value !== null &&
        'token' in value &&
        'expiresAt' in value &&
        typeof (value as { token: unknown }).token === 'string' &&
        typeof (value as { expiresAt: unknown }).expiresAt === 'number'
    );
}

async function fetchToken(auth: NucleusAuth): Promise<CachedToken> {
    const response = await httpClient.sendRequest<{ access_token: string; expires_in: number }>({
        method: HttpMethod.POST,
        url: joinUrl(auth.baseUrl, '/token'),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(auth.username)}&password=${encodeURIComponent(auth.password)}&grant_type=password`,
    });
    const expiresInMs = (response.body.expires_in ?? 3599) * 1000;
    return { token: response.body.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
}

type StoreLike = { get: (k: string) => Promise<unknown>; put: <T>(k: string, v: T) => Promise<T> };

async function getToken(auth: NucleusAuth, store: StoreLike): Promise<string> {
    const cached = await store.get(TOKEN_STORE_KEY);
    if (isCachedToken(cached) && !isExpired(cached, Date.now())) {
        return cached.token;
    }
    const fresh = await fetchToken(auth);
    await store.put(TOKEN_STORE_KEY, fresh);
    return fresh.token;
}

async function call<T>(params: {
    auth: NucleusAuth;
    store: StoreLike;
    method: HttpMethod;
    path: string;
    query?: QueryParams;
    body?: unknown;
}): Promise<T> {
    const token = await getToken(params.auth, params.store);
    const response = await httpClient.sendRequest<T>({
        method: params.method,
        url: joinUrl(params.auth.baseUrl, params.path),
        headers: { Authorization: `Bearer ${token}` },
        queryParams: { ...(params.query ?? {}), GroupName: params.auth.groupName },
        body: params.body,
    });
    return response.body;
}

export const nucleusClient = { joinUrl, isExpired, getToken, call };
