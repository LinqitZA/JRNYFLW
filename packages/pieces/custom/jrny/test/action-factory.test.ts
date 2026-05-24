import { describe, expect, test, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/lib/client', () => ({ jrnyClient: { request } }));

import { createMockActionContext } from '@activepieces/pieces-framework';
import { buildJrnyAction } from '../src/lib/action-factory';

const auth = { baseUrl: 'https://jrny', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'tok' };

describe('buildJrnyAction', () => {
    test('GET with a path param + query: substitutes entityId + id and forwards set query params', async () => {
        const action = buildJrnyAction({
            name: 'get_customer', displayName: 'Get Customer', description: '', method: 'GET',
            path: '/api/v1/integration/entities/{entityId}/customers/{code}', tag: 'x',
            pathParams: ['code'], queryParams: [{ name: 'fromDate', required: false }], hasBody: false,
        });
        request.mockResolvedValue({ code: 'ACME' });
        const ctx = { ...createMockActionContext({ propsValue: { code: 'ACME', fromDate: '2026-01-01' } }), auth };
        const result = await action.run(ctx);
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            path: '/api/v1/integration/entities/ent-1/customers/ACME',
            query: { fromDate: '2026-01-01' },
        }));
        expect(result).toEqual({ code: 'ACME' });
    });

    test('POST with a body forwards the JSON body and omits empty optional query', async () => {
        const action = buildJrnyAction({
            name: 'create_sales_order', displayName: 'Create Sales Order', description: '', method: 'POST',
            path: '/api/v1/integration/entities/{entityId}/sales-orders', tag: 'x',
            pathParams: [], queryParams: [{ name: 'externalRef', required: false }], hasBody: true,
        });
        request.mockResolvedValue({ orderNumber: 'SO1' });
        const body = { customer: { code: 'ACME' }, lines: [] };
        const ctx = { ...createMockActionContext({ propsValue: { body, externalRef: '' } }), auth };
        await action.run(ctx);
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            method: 'POST',
            path: '/api/v1/integration/entities/ent-1/sales-orders',
            body,
            query: {},
        }));
    });
});
