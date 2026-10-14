/// <reference types="vitest/globals" />
import { mailAddresses } from '../src/lib/addresses';

describe('mailAddresses.parse', () => {
    test('splits on commas, semicolons and new lines, trims, and drops blanks and repeats', () => {
        expect(mailAddresses.parse(' ops@aon.co.za; IT@aon.co.za ,\n\nops@aon.co.za,, it@AON.co.za ')).toEqual(['ops@aon.co.za', 'IT@aon.co.za']);
    });

    test('returns nothing for a blank or missing value', () => {
        expect(mailAddresses.parse('  ')).toEqual([]);
        expect(mailAddresses.parse(undefined)).toEqual([]);
    });

    test('names the first value that is not an email address', () => {
        expect(() => mailAddresses.parse('ops@aon.co.za, bob@, it@aon.co.za')).toThrow('Not an email address: bob@');
        expect(() => mailAddresses.parse('Ops Team')).toThrow('Not an email address: Ops Team');
    });
});

describe('mailAddresses.isEmail', () => {
    test('accepts ordinary addresses and rejects ones without a domain dot or with spaces', () => {
        expect(mailAddresses.isEmail('notifications@aon.co.za')).toBe(true);
        expect(mailAddresses.isEmail('a.b+c@sub.example.org')).toBe(true);
        expect(mailAddresses.isEmail('ops@localhost')).toBe(false);
        expect(mailAddresses.isEmail('ops @aon.co.za')).toBe(false);
        expect(mailAddresses.isEmail('@aon.co.za')).toBe(false);
    });
});
