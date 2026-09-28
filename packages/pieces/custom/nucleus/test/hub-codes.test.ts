/// <reference types="vitest/globals" />
import { nucleusHubCodes } from '../src/lib/hub-codes';

const TABLE = [
    row({ hub: 'CPT', suburb: 'GOODWOOD', city: 'CAPE TOWN', province: 'WESTERN CAPE', postal: '7459' }),
    row({ hub: 'CPT', suburb: 'GOODWOOD PARK', city: 'GOODWOOD PARK', province: 'WESTERN CAPE', postal: '7460' }),
    row({ hub: 'WC1', suburb: 'PALM PARK', city: 'PALM PARK', province: 'WESTERN CAPE', postal: '7460' }),
    row({ hub: 'JNB', suburb: 'SANDTON', city: 'SANDTON', province: 'GAUTENG', postal: '2146' }),
    row({ hub: 'GP1', suburb: 'MIXED A', city: 'MIXED A', province: 'GAUTENG', postal: '0299' }),
    row({ hub: 'NW1', suburb: 'MIXED B', city: 'MIXED B', province: 'NORTH WEST', postal: '0299' }),
];

// Mirrors Nucleus: every supplied filter must match the same row, case-insensitively and exactly.
const queries: Record<string, string>[] = [];
async function lookup(query: Record<string, string>) {
    queries.push(query);
    const field: Record<string, keyof (typeof TABLE)[number]> = { Suburb: 'Suburb', Postal: 'PostalCode', City: 'City', Province: 'Province' };
    return TABLE.filter((r) => Object.entries(query).every(([k, v]) => r[field[k]].toUpperCase() === v.toUpperCase()));
}

beforeEach(() => {
    queries.length = 0;
});

describe('resolveHubCode', () => {
    test('uses suburb + postal code when both match the same row', async () => {
        const result = await nucleusHubCodes.resolveHubCode({ address: { suburb: 'Sandton', postalCode: '2146' }, lookup });
        expect(result).toEqual(expect.objectContaining({ hubCode: 'JNB', matchedOn: 'suburb_and_postal_code' }));
        expect(queries).toHaveLength(1);
    });

    test('falls back to the suburb when the postal code disagrees (Goodwood, 7460)', async () => {
        const result = await nucleusHubCodes.resolveHubCode({
            address: { suburb: 'Goodwood', postalCode: '7460', city: 'Cape Town', province: 'Western Cape' },
            lookup,
        });
        expect(result).toEqual(expect.objectContaining({ hubCode: 'CPT', matchedOn: 'suburb' }));
    });

    test('never sends city or province to Nucleus alongside the suburb', async () => {
        await nucleusHubCodes.resolveHubCode({ address: { suburb: 'Goodwood', city: 'Cape Town', province: 'Western Cape' }, lookup });
        expect(queries[0]).toEqual({ Suburb: 'Goodwood' });
    });

    test('fails rather than guess when a postal code spans several hubs', async () => {
        await expect(nucleusHubCodes.resolveHubCode({ address: { suburb: 'Nowhere', postalCode: '7460' }, lookup })).rejects.toThrow(
            'Postal=7460 matches hubs CPT, WC1',
        );
    });

    test('uses the province to settle a postal code that spans provinces', async () => {
        const result = await nucleusHubCodes.resolveHubCode({ address: { postalCode: '0299', province: 'North-West' }, lookup });
        expect(result).toEqual(expect.objectContaining({ hubCode: 'NW1', matchedOn: 'postal_code' }));
    });

    test('ignores a province that matches none of the candidates', async () => {
        const result = await nucleusHubCodes.resolveHubCode({ address: { suburb: 'Sandton', province: 'Gauteng Province' }, lookup });
        expect(result.hubCode).toBe('JNB');
    });

    test('reports every attempt when nothing matches', async () => {
        await expect(nucleusHubCodes.resolveHubCode({ address: { suburb: 'Atlantis', postalCode: '9999' }, lookup })).rejects.toThrow(
            'tried Suburb=Atlantis + Postal=9999; Suburb=Atlantis; Postal=9999',
        );
    });

    test('requires at least one address field', async () => {
        await expect(nucleusHubCodes.resolveHubCode({ address: { province: 'Gauteng' }, lookup })).rejects.toThrow('at least a Suburb');
    });
});

describe('parseHubRows', () => {
    test('extracts rows from the first result set and drops malformed ones', () => {
        const body = { ResultSets: [[TABLE[0], { HubCode: 'X' }]], OutputParameters: {}, ReturnValue: 0 };
        expect(nucleusHubCodes.parseHubRows(body)).toEqual([TABLE[0]]);
    });

    test('returns no rows for an empty result set', () => {
        expect(nucleusHubCodes.parseHubRows({ ResultSets: [[]], OutputParameters: {}, ReturnValue: 0 })).toEqual([]);
    });
});

function row({ hub, suburb, city, province, postal }: { hub: string; suburb: string; city: string; province: string; postal: string }) {
    return { HubCode: hub, Suburb: suburb, City: city, Province: province, PostalCode: postal };
}
