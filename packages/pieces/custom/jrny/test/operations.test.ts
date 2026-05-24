import { describe, expect, test } from 'vitest';
import { jrnyOperations } from '../src/lib/operations';

describe('jrnyOperations manifest', () => {
    test('contains all 88 operations', () => {
        expect(jrnyOperations.length).toBe(88);
    });
    test('action names are unique', () => {
        const names = jrnyOperations.map((o) => o.name);
        expect(new Set(names).size).toBe(names.length);
    });
    test('createSalesOrder is a POST with a body and no extra path params', () => {
        const op = jrnyOperations.find((o) => o.name === 'create_sales_order');
        expect(op).toMatchObject({ method: 'POST', hasBody: true, pathParams: [], path: '/api/v1/integration/entities/{entityId}/sales-orders' });
    });
    test('getCustomer is a GET with a code path param', () => {
        const op = jrnyOperations.find((o) => o.name === 'get_customer');
        expect(op).toMatchObject({ method: 'GET', hasBody: false, pathParams: ['code'] });
    });
    test('listProducts exposes its query params', () => {
        const op = jrnyOperations.find((o) => o.name === 'list_products');
        expect(op?.queryParams.map((q) => q.name)).toEqual(expect.arrayContaining(['search', 'cursor', 'limit']));
    });
});
