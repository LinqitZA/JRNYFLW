/// <reference types="vitest/globals" />
import { nucleusClient } from '../src/lib/client';

describe('nucleusClient helpers', () => {
    test('joinUrl normalizes the inconsistent trailing slash', () => {
        expect(nucleusClient.joinUrl('https://api/', '/GetTracking')).toBe('https://api/GetTracking');
        expect(nucleusClient.joinUrl('https://api', 'GetTracking')).toBe('https://api/GetTracking');
    });

    test('isExpired returns true when now is past the stored expiry', () => {
        expect(nucleusClient.isExpired({ token: 't', expiresAt: 1000 }, 2000)).toBe(true);
        expect(nucleusClient.isExpired({ token: 't', expiresAt: 5000 }, 2000)).toBe(false);
    });
});
