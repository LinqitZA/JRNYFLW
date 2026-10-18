import { describe, expect, test } from 'vitest';
import { invoiceReadiness } from '../src/lib/invoice-readiness';

const line = (over: Record<string, unknown> = {}) => ({
    lineNumber: '1', productCode: 'TRI100', description: 'Test item', quantity: 12, uom: 'EACH', unitPrice: 10,
    vatRate: 15, lineTotal: 120, vatAmount: 18, taxCode: 'S', gtin: '06001234567892', gtinSource: 'gtin', ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
    invoiceNumber: 'INV-1001', invoiceDate: '2026-10-20', customerPoNumber: ' 1221181491 ', salesOrderNumber: 'SO-1',
    subtotal: 120, vatTotal: 18, total: 138, deliveryAddress: { code: '1608', gln: '6001234567899' }, lines: [line()], ...over,
});
const delivered = { dispatchNumber: 'DN-1', podSignedAt: '2026-10-21T09:00:00Z', podUrl: null };

describe('invoiceReadiness.screen', () => {
    test('passes an unsent invoice with a PO', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: null })).toBeNull();
    });
    test('skips an invoice with no PO', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: '  ', apiDelivery: null })).toBe('noPurchaseOrder');
    });
    test('skips a failed invoice recorded as UNCONFIRMED', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'failed', lastMessage: 'UNCONFIRMED: no answer' } })).toBe('unconfirmed');
    });
    test('passes a failed invoice with any other reason, and a reset one', () => {
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'failed', lastMessage: 'REJECTED: bad' } })).toBeNull();
        expect(invoiceReadiness.screen({ customerPoNumber: 'PO1', apiDelivery: { status: 'reset', lastMessage: 'UNCONFIRMED: old' } })).toBeNull();
    });
});

describe('invoiceReadiness.assess', () => {
    test('a delivered invoice with GTINs and a GLN is clean, in Send Invoice shape', () => {
        const result = invoiceReadiness.assess({ detail: detail(), dispatches: [delivered] });
        expect(result).toEqual({
            kind: 'ready',
            invoice: {
                invoiceNumber: 'INV-1001', invoiceDate: '2026-10-20', purchaseOrder: '1221181491', storeGln: '6001234567899', deliveryAddressCode: '1608',
                totalExclVat: 120, totalVat: 18, totalInclVat: 138, clean: true, problem: null,
                lines: [{ lineNumber: 1, quantity: 12, lineTotalExclVat: 120, lineTotalInclVat: 138, description: 'Test item', gtin: '06001234567892', productCode: 'TRI100', uom: 'EACH' }],
            },
        });
    });
    test('waits when there is no sales order, no dispatch, or a dispatch without a POD', () => {
        expect(invoiceReadiness.assess({ detail: detail({ salesOrderNumber: null }), dispatches: [] })).toEqual({ kind: 'waiting', reason: 'noSalesOrder' });
        expect(invoiceReadiness.assess({ detail: detail(), dispatches: [] })).toEqual({ kind: 'waiting', reason: 'noDispatch' });
        expect(invoiceReadiness.assess({ detail: detail(), dispatches: [delivered, { dispatchNumber: 'DN-2', podSignedAt: null, podUrl: null }] })).toEqual({ kind: 'waiting', reason: 'notDelivered' });
    });
    test('a POD link alone counts as delivered', () => {
        const result = invoiceReadiness.assess({ detail: detail(), dispatches: [{ podSignedAt: null, podUrl: 'https://pod/1' }] });
        expect(result.kind).toBe('ready');
    });
    test('a default barcode is never passed on, and the problem names product and unit', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line(), line({ lineNumber: '2', productCode: 'TRI200', uom: 'BOX', gtin: '12345670', gtinSource: 'default' })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ kind: 'ready', invoice: { clean: false, problem: 'Line 2 (TRI200, BOX): no Shoprite GTIN in JRNY' } });
        if (result.kind === 'ready') expect(result.invoice.lines[1].gtin).toBeNull();
    });
    test('a missing GLN is a problem naming the address code, joined with the line problems', () => {
        const result = invoiceReadiness.assess({ detail: detail({ deliveryAddress: { code: '1608', gln: null }, lines: [line({ gtin: null, gtinSource: null })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ kind: 'ready', invoice: { clean: false, storeGln: null, problem: 'Delivery address 1608 has no GLN in JRNY; Line 1 (TRI100, EACH): no Shoprite GTIN in JRNY' } });
    });
    test('no delivery address at all is a problem', () => {
        const result = invoiceReadiness.assess({ detail: detail({ deliveryAddress: null }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { problem: 'The invoice has no delivery address in JRNY' } });
    });
    test('line incl. VAT is rounded to whole cents', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line({ lineTotal: 0.1, vatAmount: 0.2 })] }), dispatches: [delivered] });
        if (result.kind === 'ready') expect(result.invoice.lines[0].lineTotalInclVat).toBe(0.3);
    });
    test('a date-time invoice date is cut to the date', () => {
        const result = invoiceReadiness.assess({ detail: detail({ invoiceDate: '2026-10-20T00:00:00.000Z' }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { invoiceDate: '2026-10-20' } });
    });
    test('a line number that is not a whole number is kept as text and named as a problem', () => {
        const result = invoiceReadiness.assess({ detail: detail({ lines: [line({ lineNumber: '1a' })] }), dispatches: [delivered] });
        expect(result).toMatchObject({ invoice: { clean: false, problem: 'Line 1a: the line number is not a whole number', lines: [{ lineNumber: '1a' }] } });
    });
});
