// Made-up GLNs, GTINs and prices with valid GS1 check digits; the real sample carries production pricing and stays out of the repo.
export function lineOne(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        lineNumber: 1,
        quantity: 2,
        lineTotalExclVat: 200,
        lineTotalInclVat: 230,
        description: 'Visitor Badges & Lanyards PK50',
        gtin: '06001234000013',
        ...overrides,
    };
}

export function lineTwo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        lineNumber: 2,
        quantity: 1.5,
        lineTotalExclVat: 10.1,
        lineTotalInclVat: 11.62,
        description: 'Seals <red> 100',
        gtin: '6001234000020',
        ...overrides,
    };
}

export function invoiceProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        invoiceNumber: 'INV-1001',
        invoiceDate: '2026-10-16',
        purchaseOrder: '1220000001',
        storeGln: '6001234567899',
        totalExclVat: 210.1,
        totalVat: 31.52,
        totalInclVat: 241.62,
        lines: [lineOne(), lineTwo()],
        ...overrides,
    };
}

export const SUPPLIER = { gln: '6009876543219', vatRegistrationNumber: '4000000001' };
export const SENT_AT = new Date('2026-10-17T08:15:30Z');
