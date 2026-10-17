/// <reference types="vitest/globals" />
import { gs1Orders } from '../src/lib/gs1-orders';
import { gs1Document, gs1Line, gs1Order } from './fixtures/gs1';

const keyControl = gs1Line({ lineNumber: 1, supplierCode: 'CSL1388', gtin: '06001001438896', description: 'KEY CONTROL 5PACK BOOK', quantity: 1, unitExcl: 30.0, unitIncl: 34.5 });
const sealBags = gs1Line({ lineNumber: 2, supplierCode: '1/SEALS', gtin: '02200072628234', description: 'BAG FLOAT SEALS 1000S', quantity: 20, unitExcl: 10.1, unitIncl: 11.62, deliveryDate: '2026-10-23' });
const stamper = gs1Line({ lineNumber: 3, supplierCode: '', gtin: '06001224126747', description: 'X STAMPER BOOK PK25', quantity: 2, unitExcl: 50, unitIncl: 57.5, deliveryDate: '2026-10-18' });

describe('gs1Orders.parse', () => {
    test('maps the order header and the store', () => {
        const result = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1221181491', lines: [keyControl] })] }));
        expect(result).toMatchObject({ count: 1, createdAt: '2026-10-16T16:00:19.7071905+02:00', orderNumbers: '1221181491' });
        expect(result.orders[0]).toMatchObject({
            orderNumber: '1221181491', headerId: '242306305', orderType: '220', orderDate: '2026-10-16',
            store: { branch: '1608', name: 'TEST STORE ONE', gln: '6001001016001' }, warnings: [],
        });
    });

    test('maps a line, keeping the GTIN exactly and telling unit prices from line totals', () => {
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', lines: [sealBags] })] })).orders;
        expect(order.lines[0]).toEqual({
            lineNumber: 2, supplierItemCode: '1/SEALS', gtin: '02200072628234', buyerItemCode: '10367034',
            description: 'BAG FLOAT SEALS 1000S', quantity: 20, uom: 'EA',
            unitPriceExclVat: 10.1, unitPriceInclVat: 11.62, lineTotalExclVat: 202, lineTotalInclVat: 232.4,
            deliveryDate: '2026-10-23', shipTo: { branch: '1608', gln: '6001001016001' },
        });
    });

    test('turns an empty supplier item code into null', () => {
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', lines: [stamper] })] })).orders;
        expect(order.lines[0]).toMatchObject({ supplierItemCode: null, gtin: '06001224126747' });
    });

    test('uses the earliest line delivery date and adds up the totals', () => {
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', lines: [keyControl, sealBags, stamper] })] })).orders;
        expect(order).toMatchObject({ deliveryDate: '2026-10-18', totalExclVat: 332, totalInclVat: 381.9 });
    });

    test('warns about another ship-to, a non-zero discount and an unusual order type', () => {
        const otherStore = gs1Line({ lineNumber: 1, supplierCode: 'A', gtin: '1', description: 'A', quantity: 1, unitExcl: 1, unitIncl: 1.15, shipToGln: '6001001999999' });
        const discounted = gs1Line({ lineNumber: 2, supplierCode: 'B', gtin: '2', description: 'B', quantity: 1, unitExcl: 1, unitIncl: 1.15, discounts: { T1: '5.00' } });
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', orderType: '221', lines: [otherStore, discounted] })] })).orders;
        expect(order.warnings).toEqual([
            'Order type 221, not a normal order (220)',
            "Line 1 ships to GLN 6001001999999, not the store's GLN 6001001016001",
            'Line 2 has a Trade Discount 1 of 5.00',
        ]);
    });

    test('accepts numbers sent as strings', () => {
        const line = gs1Line({ lineNumber: 1, supplierCode: 'A', gtin: '1', description: 'A', quantity: '2.0', unitExcl: '10.50', unitIncl: '12.08' });
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', lines: [line] })] })).orders;
        expect(order.lines[0]).toMatchObject({ quantity: 2, unitPriceExclVat: 10.5, unitPriceInclVat: 12.08 });
    });

    test('a line without delivery details still parses, with no delivery date or ship-to', () => {
        const bare = gs1Line({ lineNumber: 1, supplierCode: 'A', gtin: '1', description: 'A', quantity: 1, unitExcl: 1, unitIncl: 1.15, withDetail: false });
        const [order] = gs1Orders.parse(gs1Document({ orders: [gs1Order({ orderNumber: '1', lines: [bare, sealBags] })] })).orders;
        expect(order.lines[0]).toMatchObject({ deliveryDate: null, shipTo: null });
        expect(order.deliveryDate).toBe('2026-10-23');
    });

    test.each([undefined, null, '', {}, { orderField: null }, { orderField: [] }])('treats %j as an empty batch', (body) => {
        expect(gs1Orders.parse(body)).toMatchObject({ count: 0, orderNumbers: '', orders: [] });
    });

    test.each([
        ['<html>Error</html>', 'Unexpected response from Shoprite: the body is not a GS1 document'],
        [{ orderField: 'x' }, 'Unexpected response from Shoprite: orderField is not a list'],
        [gs1Document({ orders: [gs1Order({ orderNumber: '', lines: [keyControl] })] }), 'Unexpected response from Shoprite: order 1 has no order number'],
        [gs1Document({ orders: [gs1Order({ orderNumber: '1221181491', lines: [] })] }), 'Unexpected response from Shoprite: order 1221181491 has no lines'],
    ])('rejects %j', (body, message) => {
        expect(() => gs1Orders.parse(body)).toThrow(message);
    });
});
