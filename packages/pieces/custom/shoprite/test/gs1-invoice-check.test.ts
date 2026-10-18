/// <reference types="vitest/globals" />
import { gs1Invoice } from '../src/lib/gs1-invoice';
import { invoiceProps, lineOne, lineTwo } from './fixtures/invoice';

function problemsOf(overrides: Record<string, unknown>): string {
    try {
        gs1Invoice.check(invoiceProps(overrides));
        return '';
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

describe('gs1Invoice.check', () => {
    test('accepts a complete invoice, in cents, with lines in line-number order and 14-digit GTINs', () => {
        const invoice = gs1Invoice.check(invoiceProps({ lines: [lineTwo(), lineOne()] }));
        expect(invoice).toEqual({
            invoiceNumber: 'INV-1001',
            invoiceDate: '2026-10-16',
            purchaseOrder: '1220000001',
            storeGln: '6001234567899',
            totals: { exclVatCents: 21010, vatCents: 3152, inclVatCents: 24162 },
            lines: [
                { lineNumber: 1, quantity: 2, exclVatCents: 20000, inclVatCents: 23000, vatCents: 3000, description: 'Visitor Badges & Lanyards PK50', gtin: '06001234000013' },
                { lineNumber: 2, quantity: 1.5, exclVatCents: 1010, inclVatCents: 1162, vatCents: 152, description: 'Seals <red> 100', gtin: '06001234000020' },
            ],
        });
    });

    test('reads amounts, quantities and line numbers sent as text', () => {
        const invoice = gs1Invoice.check(invoiceProps({
            totalExclVat: '210.10',
            totalVat: '31.52',
            totalInclVat: '241.62',
            lines: [lineOne({ lineNumber: '1', quantity: '2', lineTotalExclVat: '200.00', lineTotalInclVat: '230.00' }), lineTwo()],
        }));
        expect(invoice.totals).toEqual({ exclVatCents: 21010, vatCents: 3152, inclVatCents: 24162 });
        expect(invoice.lines[0]).toMatchObject({ lineNumber: 1, quantity: 2, exclVatCents: 20000 });
    });

    test('trims text and removes control characters other than tab', () => {
        const invoice = gs1Invoice.check(invoiceProps({ invoiceNumber: ' INV-1001 ', lines: [lineOne({ description: '  Badges\tPK50\r\n ' }), lineTwo()] }));
        expect(invoice.invoiceNumber).toBe('INV-1001');
        expect(invoice.lines[0].description).toBe('Badges\tPK50');
    });

    test.each([
        ['invoiceNumber', 'Invoice Number is required'],
        ['invoiceDate', 'Invoice Date is required'],
        ['purchaseOrder', 'Purchase Order is required'],
        ['storeGln', 'Store GLN is required'],
        ['totalExclVat', 'Total Excl. VAT is required'],
        ['totalVat', 'Total VAT is required'],
        ['totalInclVat', 'Total Incl. VAT is required'],
    ])('refuses a blank %s', (key, message) => {
        expect(problemsOf({ [key]: '' })).toBe(message);
    });

    test.each(['16/10/2026', '2026-02-30', '2026-10-16T00:00'])('refuses the invoice date %s', (invoiceDate) => {
        expect(problemsOf({ invoiceDate })).toBe('Invoice Date must be YYYY-MM-DD, e.g. 2026-10-17');
    });

    test('refuses a store GLN with a wrong check digit or length', () => {
        expect(problemsOf({ storeGln: '6001234567898' })).toBe('Store GLN 6001234567898 has a wrong check digit');
        expect(problemsOf({ storeGln: '600123456789' })).toBe('Store GLN must be 13 digits: 600123456789');
    });

    test('refuses an invoice with no lines', () => {
        expect(problemsOf({ lines: [] })).toBe('The invoice has no lines');
        expect(problemsOf({ lines: undefined })).toBe('The invoice has no lines');
    });

    test('names an empty item in the lines list instead of crashing', () => {
        expect(problemsOf({ lines: [null, lineTwo()] })).toBe('Item 1 is empty');
    });

    test('refuses missing, non-whole and repeated line numbers', () => {
        expect(problemsOf({ lines: [lineOne({ lineNumber: null }), lineTwo()] })).toBe('Item 1: Line Number is required');
        expect(problemsOf({ lines: [lineOne({ lineNumber: 0 }), lineTwo()] })).toBe('Item 1: Line Number must be a whole number above 0');
        expect(problemsOf({ lines: [lineOne({ lineNumber: 1.5 }), lineTwo()] })).toBe('Item 1: Line Number must be a whole number above 0');
        expect(problemsOf({ lines: [lineOne(), lineTwo({ lineNumber: 1 })] })).toBe('Line 1 appears twice');
    });

    test('refuses a quantity that is missing, not a number, or not above 0', () => {
        expect(problemsOf({ lines: [lineOne(), lineTwo({ quantity: null })] })).toBe('Line 2: Quantity is required');
        expect(problemsOf({ lines: [lineOne(), lineTwo({ quantity: 'two' })] })).toBe('Line 2: Quantity must be a number');
        expect(problemsOf({ lines: [lineOne(), lineTwo({ quantity: 0 })] })).toBe('Line 2: quantity must be more than 0');
    });

    test('refuses negative or inverted line totals', () => {
        expect(problemsOf({ lines: [lineOne(), lineTwo({ lineTotalExclVat: -1 })] })).toBe("Line 2: Line Total Excl. VAT can't be negative");
        expect(problemsOf({ lines: [lineOne(), lineTwo({ lineTotalInclVat: 10 })] })).toBe('Line 2: Line Total Incl. VAT is less than excl.');
    });

    test('refuses a line whose VAT is not 15% of excl. to within a cent', () => {
        expect(problemsOf({ lines: [lineOne({ lineTotalInclVat: 212 }), lineTwo()] })).toBe('Line 1: VAT 12.00 is not 15% of 200.00');
    });

    test('refuses a blank description', () => {
        expect(problemsOf({ lines: [lineOne(), lineTwo({ description: '   ' })] })).toBe('Line 2: Description is required');
    });

    test('refuses a missing, short or wrong-check-digit GTIN', () => {
        expect(problemsOf({ lines: [lineOne({ gtin: '' }), lineTwo()] })).toBe('Line 1: GTIN is required');
        expect(problemsOf({ lines: [lineOne({ gtin: '12345' }), lineTwo()] })).toBe('Line 1: GTIN must be 13 or 14 digits: 12345');
        expect(problemsOf({ lines: [lineOne({ gtin: '06001234000014' }), lineTwo()] })).toBe('Line 1: GTIN 06001234000014 has a wrong check digit');
    });

    test('refuses header totals more than a cent away from the line sums', () => {
        expect(problemsOf({ totalInclVat: 241.64 })).toBe('Total Incl. VAT 241.64 does not match the lines (241.62)');
        expect(problemsOf({ totalInclVat: 241.63 })).toBe('');
    });

    test('reports every problem at once', () => {
        expect(problemsOf({ purchaseOrder: '', lines: [lineOne({ gtin: '' }), lineTwo()] })).toBe('Purchase Order is required; Line 1: GTIN is required');
    });
});

describe('gs1Invoice.isGln', () => {
    test('accepts only 13 digits with a valid check digit', () => {
        expect(gs1Invoice.isGln('6009876543219')).toBe(true);
        expect(gs1Invoice.isGln('6009876543210')).toBe(false);
        expect(gs1Invoice.isGln('600987654321')).toBe(false);
    });
});
