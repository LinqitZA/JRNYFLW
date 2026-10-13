import { HttpMethod } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
import { AonPortalAuth } from './auth';

// People paste the API root as often as the site root, so a trailing /api/erp is dropped to avoid /api/erp/api/erp.
function joinUrl({ base, path }: { base: string; path: string }): string {
    const root = base.trim().replace(/\/+$/, '').replace(/\/api\/erp$/i, '');
    return `${root}/${path.replace(/^\/+/, '')}`;
}

async function call<T>({ trace, auth, method, path, query, body }: CallParams): Promise<T> {
    const response = await trace.send<T>({
        request: {
            method,
            url: joinUrl({ base: auth.portalUrl, path }),
            headers: { 'X-API-Key': auth.apiKey, Accept: 'application/json' },
            queryParams: query,
            body,
        },
    });
    return response.body;
}

function secretsOf(auth: AonPortalAuth): string[] {
    return [auth.apiKey];
}

function isOrderPage(value: unknown): value is OrderPage {
    if (typeof value !== 'object' || value === null || !('orders' in value) || !('pagination' in value)) {
        return false;
    }
    const pagination: unknown = value.pagination;
    return (
        Array.isArray(value.orders) &&
        typeof pagination === 'object' &&
        pagination !== null &&
        'totalPages' in pagination &&
        typeof pagination.totalPages === 'number' &&
        'total' in pagination &&
        typeof pagination.total === 'number'
    );
}

export const aonPortalClient = { joinUrl, call, secretsOf, isOrderPage };

export type OrderPage = { orders: unknown[]; pagination: { total: number; totalPages: number } };

type CallParams = { trace: Tracer; auth: AonPortalAuth; method: HttpMethod; path: string; query?: Record<string, string>; body?: unknown };
