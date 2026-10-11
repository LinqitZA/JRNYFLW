import { HttpMethod, QueryParams } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
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

async function fetchToken({ auth, trace }: { auth: NucleusAuth; trace: Tracer }): Promise<CachedToken> {
    const response = await trace.send<{ access_token: string; expires_in: number }>({
        request: {
            method: HttpMethod.POST,
            url: joinUrl(auth.baseUrl, '/token'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenForm({ username: auth.username, encodedPassword: encodeURIComponent(auth.password) }),
        },
        bodyForTrace: tokenForm({ username: auth.username, encodedPassword: pieceTrace.redacted }),
    });
    const expiresInMs = (response.body.expires_in ?? 3599) * 1000;
    return { token: response.body.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
}

function tokenForm({ username, encodedPassword }: { username: string; encodedPassword: string }): string {
    return `username=${encodeURIComponent(username)}&password=${encodedPassword}&grant_type=password`;
}

type StoreLike = { get: (k: string) => Promise<unknown>; put: <T>(k: string, v: T) => Promise<T> };

async function getToken({ auth, store, trace }: { auth: NucleusAuth; store: StoreLike; trace: Tracer }): Promise<string> {
    const cached = await store.get(TOKEN_STORE_KEY);
    if (isCachedToken(cached) && !isExpired(cached, Date.now())) {
        return cached.token;
    }
    const fresh = await fetchToken({ auth, trace });
    await store.put(TOKEN_STORE_KEY, fresh);
    return fresh.token;
}

async function call<T>(params: {
    trace: Tracer;
    auth: NucleusAuth;
    store: StoreLike;
    method: HttpMethod;
    path: string;
    query?: QueryParams;
    body?: unknown;
}): Promise<T> {
    const token = await getToken({ auth: params.auth, store: params.store, trace: params.trace });
    const response = await params.trace.send<T>({
        request: {
            method: params.method,
            url: joinUrl(params.auth.baseUrl, params.path),
            headers: { Authorization: `Bearer ${token}` },
            queryParams: { ...(params.query ?? {}), GroupName: params.auth.groupName },
            body: params.body,
        },
    });
    throwIfResultSetError(response.body);
    return response.body;
}

// Nucleus form-encodes the password, so both spellings must be scrubbed.
function secretsOf(auth: NucleusAuth): string[] {
    return [auth.password, encodeURIComponent(auth.password)];
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

export const nucleusClient = { joinUrl, isExpired, getToken, call, throwIfResultSetError, secretsOf };
