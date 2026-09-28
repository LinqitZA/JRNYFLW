async function resolveHubCode({ address, lookup }: { address: HubAddress; lookup: HubLookup }): Promise<HubResolution> {
    const suburb = clean(address.suburb);
    const postalCode = clean(address.postalCode);
    const city = clean(address.city);
    const attempts: Attempt[] = [
        ...(suburb && postalCode ? [{ matchedOn: 'suburb_and_postal_code' as const, query: { Suburb: suburb, Postal: postalCode } }] : []),
        ...(suburb ? [{ matchedOn: 'suburb' as const, query: { Suburb: suburb } }] : []),
        ...(postalCode ? [{ matchedOn: 'postal_code' as const, query: { Postal: postalCode } }] : []),
        ...(city ? [{ matchedOn: 'city' as const, query: { City: city } }] : []),
    ];
    if (attempts.length === 0) {
        throw new Error('Provide at least a Suburb, Postal Code or City to find a hub code');
    }
    const ambiguous: string[] = [];
    for (const attempt of attempts) {
        const rows = narrowByProvince({ rows: await lookup(attempt.query), province: address.province });
        const hubs = unique(rows.map((r) => r.HubCode));
        if (hubs.length === 1) {
            return { hubCode: hubs[0], matchedOn: attempt.matchedOn, candidates: rows };
        }
        if (hubs.length > 1) {
            ambiguous.push(`${describe(attempt.query)} matches hubs ${hubs.join(', ')}`);
        }
    }
    const tried = attempts.map((a) => describe(a.query)).join('; ');
    const detail = ambiguous.length > 0 ? ` Ambiguous: ${ambiguous.join('; ')}.` : '';
    throw new Error(`No single Nucleus hub code found for this address (tried ${tried}).${detail}`);
}

function parseHubRows(body: unknown): HubRow[] {
    if (typeof body !== 'object' || body === null || !('ResultSets' in body) || !Array.isArray(body.ResultSets)) {
        return [];
    }
    const firstSet: unknown = body.ResultSets[0];
    if (!Array.isArray(firstSet)) {
        return [];
    }
    return firstSet.flatMap((row) => (isHubRow(row) ? [row] : []));
}

// Only narrows when the province actually matches something, so a differently spelled province can't discard a valid match.
function narrowByProvince({ rows, province }: { rows: HubRow[]; province: string | undefined }): HubRow[] {
    const wanted = normaliseProvince(province);
    if (!wanted) {
        return rows;
    }
    const narrowed = rows.filter((r) => normaliseProvince(r.Province) === wanted);
    return narrowed.length > 0 ? narrowed : rows;
}

function normaliseProvince(value: string | undefined): string {
    return (value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

function isHubRow(value: unknown): value is HubRow {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return HUB_ROW_KEYS.every((key) => key in value && typeof Reflect.get(value, key) === 'string');
}

function clean(value: string | undefined): string {
    return (value ?? '').trim();
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function describe(query: Record<string, string>): string {
    return Object.entries(query)
        .map(([k, v]) => `${k}=${v}`)
        .join(' + ');
}

const HUB_ROW_KEYS = ['HubCode', 'Suburb', 'City', 'Province', 'PostalCode'];

export const nucleusHubCodes = { resolveHubCode, parseHubRows };

type Attempt = { matchedOn: HubMatch; query: Record<string, string> };
type HubMatch = 'suburb_and_postal_code' | 'suburb' | 'postal_code' | 'city';
type HubLookup = (query: Record<string, string>) => Promise<HubRow[]>;
type HubAddress = { suburb?: string; postalCode?: string; city?: string; province?: string };
type HubRow = { HubCode: string; Suburb: string; City: string; Province: string; PostalCode: string };
type HubResolution = { hubCode: string; matchedOn: HubMatch; candidates: HubRow[] };
