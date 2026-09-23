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
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    if (!('token' in value) || !('expiresAt' in value)) {
        return false;
    }
    return typeof value.token === 'string' && typeof value.expiresAt === 'number';
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
    throwIfResultSetError(response.body);
    return response.body;
}

// Nucleus reports business failures as HTTP 200 with an error row, so without this a flow would carry on as if the call succeeded.
function throwIfResultSetError(body: unknown): void {
    if (typeof body !== 'object' || body === null || !('ResultSets' in body) || !Array.isArray(body.ResultSets)) {
        return;
    }
    for (const resultSet of body.ResultSets) {
        if (!Array.isArray(resultSet)) {
            continue;
        }
        for (const row of resultSet) {
            const message = errorMessageOf(row);
            if (message !== undefined) {
                throw new Error(`Nucleus error: ${message}`);
            }
        }
    }
}

function errorMessageOf(row: unknown): string | undefined {
    if (typeof row !== 'object' || row === null) {
        return undefined;
    }
    for (const key of ERROR_KEYS) {
        if (key in row) {
            const value: unknown = Reflect.get(row, key);
            if (typeof value === 'string' && value.trim() !== '') {
                return value;
            }
        }
    }
    return undefined;
}

const ERROR_KEYS = ['Error', 'ErrorMessage'];

export const nucleusClient = { joinUrl, isExpired, getToken, call, throwIfResultSetError };
