/// <reference types="vitest/globals" />
import { shopriteClient } from '../src/lib/client';

describe('shopriteClient.buildHeaders', () => {
    test('builds the four auth headers with base64 basic credentials', () => {
        const headers = shopriteClient.buildHeaders({
            baseUrl: 'https://x/b2bservice',
            username: 'acme',
            password: 'secret',
            contractId: 'cid-123',
            invoiceEndpoint: 'VendorInvoice',
        });
        const b64 = Buffer.from('acme:secret').toString('base64');
        expect(headers).toEqual({
            Authorization: `Basic ${b64}`,
            Authentication: b64,
            ContractID: 'cid-123',
            UIUser: 'acme',
        });
    });

    test('joinUrl normalizes slashes between base and path', () => {
        expect(shopriteClient.joinUrl('https://x/b2bservice/', '/api/VendorOrder')).toBe('https://x/b2bservice/api/VendorOrder');
        expect(shopriteClient.joinUrl('https://x/b2bservice', 'api/VendorOrder')).toBe('https://x/b2bservice/api/VendorOrder');
    });
});
