# Shoprite Orders → JRNY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shoprite B2B orders load into JRNY:
- as confirmed sales orders with a pick when everything matches;
- as drafts with the problems noted when the store or an item doesn't match.

**Architecture:** The flow is built in the UAT builder, and the pieces do the hard work:
- the Shoprite piece turns the GS1 download into plain orders (a pure parser plus the existing call);
- the JRNY piece gains Resolve Order Lines (address and item checks with fallbacks) and Generate Pick, and Create Quote gains delivery date, auto-confirm and an idempotency key.

**Tech Stack:** TypeScript, Activepieces pieces framework, `@activepieces/pieces-common` httpClient (mocked in tests), `@jrnyflw/piece-trace`, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md`

## Global Constraints

- GTINs and barcodes are used **exactly as given**: no stripping or padding of leading zeros. JRNY matches a 13-digit EAN to the 14-digit GTIN on its side.
- Each line sends Shoprite's unit price excl. VAT (`unitPriceExclVat`). Omit it only when there's none.
- Nothing calls Shoprite's Acknowledge Orders. Tests make no live calls, and the API integration tests are never run.
- Repo conventions:
  - named (destructured) parameters for functions with more than one parameter;
  - util files export one object (`export const x = { … }`);
  - exported types and constants go at the end of the file;
  - no `any`, no `as` casts in new code;
  - comments only to explain why.
- Secrets never appear in step output. Tests assert the bearer token and the Shoprite password are absent.
- No piece version bumps. Ruling: the existing exported flows pin `0.1.0`, and the dev pieces load from dist.
- Run tests from the piece folder: `cd packages/pieces/custom/<piece> && bunx vitest run`. Type check: `bunx tsc -p tsconfig.lib.json --noEmit`. Lint: `bunx eslint 'src/**/*.ts'`.

## Review Focus

1. **A JRNY stock code containing `/`** (Shoprite sends `1/SEALS`) must be URL-encoded in the path (`/products/1%2FSEALS`). Otherwise it hits the wrong route and the line is wrongly dropped. Pinned in Task 2.
2. **GS1 numbers sent as strings** (`"2.0"`) must still parse as numbers, not become `null`. Pinned in Task 1.
3. **A line with no `orderLineItemDetailField`** must parse, with a `null` delivery date and ship-to, not crash the whole download. Pinned in Task 1.
4. **A line with no unit price** must omit `unitPrice`, so JRNY prices it, rather than sending `null` or `0`. Pinned in Task 2.
5. **Auto-confirm set from an expression** may arrive as the string `"true"`, and must still confirm. Pinned in Task 3.

---

### Task 1: Shoprite · Download Orders returns plain orders

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/gs1-orders.ts`
- Create: `packages/pieces/custom/shoprite/test/fixtures/gs1.ts`
- Create: `packages/pieces/custom/shoprite/test/gs1-orders.test.ts`
- Modify: `packages/pieces/custom/shoprite/src/lib/actions/download-orders.ts`
- Modify: `packages/pieces/custom/shoprite/test/download-orders.test.ts`

**Interfaces:**
- Produces: `gs1Orders.parse(body: unknown): ShopriteOrders`, exported types `ShopriteOrders`, `ShopriteOrder`, `ShopriteOrderLine`. The Download Orders output is `ShopriteOrders`.

Ruling: the test fixture is a builder that reproduces the GS1 structure of the 2026-10-17 download (exact key names, including the null fields around the paths we read), with made-up store names and prices. The spec says no production pricing is committed.

- [ ] **Step 1: Write the fixture builder**

`test/fixtures/gs1.ts`:

```ts
const ZERO_DISCOUNTS = [
    ['B', 'Backhaul Allowance'], ['C', 'Efficiency Allowance'], ['D', 'Port Direct Allowance'], ['F', 'Ex-Factory Allowance'],
    ['S1', 'Bulk Order Allowance'], ['S2', 'Warehouse Allowance'], ['SA', 'Swell Allowance'], ['T1', 'Trade Discount 1'],
    ['T2', 'Trade Discount 2'], ['T3', 'Return Centre Allowance'],
];

export function gs1Document({ orders }: { orders: unknown[] }) {
    return {
        standardBusinessDocumentHeaderField: {
            headerVersionField: '3.2',
            documentIdentificationField: {
                standardField: 'GS1', typeField: 'Order', creationDateAndTimeField: '2026-10-16T16:00:19.7071905+02:00',
                instanceIdentifierField: '',
            },
            manifestField: { numberOfItemsField: String(orders.length), manifestItemField: null },
        },
        orderField: orders,
    };
}

export function gs1Order({ orderNumber, headerId = '242306305', branch = '1608', storeName = 'TEST STORE ONE', gln = '6001001016001', orderDate = '2026-10-16', orderType = '220', lines }: Gs1OrderInput) {
    return {
        orderIdentificationField: {
            entityIdentificationField: orderNumber,
            contentOwnerField: { glnField: null, additionalPartyIdentificationField: [partyId({ type: 'BUYER_ASSIGNED_ORDER_HEADERID', value: headerId })] },
        },
        orderTypeCodeField: { codeListVersionField: 'Normal', valueField: orderType },
        totalMonetaryAmountExcludingTaxesField: null,
        totalMonetaryAmountIncludingTaxesField: null,
        buyerField: {
            glnField: gln,
            additionalPartyIdentificationField: [
                partyId({ type: 'BUYER_ASSIGNED_IDENTIFIER_FOR_A_PARTY', value: branch }),
                partyId({ type: 'BUYER_ASSIGNED_DESCRIPTION_FOR_A_PARTY', value: storeName }),
            ],
            addressField: null,
        },
        sellerField: { glnField: '6001651203943', additionalPartyIdentificationField: [partyId({ type: 'BUYER_ASSIGNED_VENDOR_ID', value: '242626' })] },
        orderLineItemField: lines,
        avpListField: null,
        creationDateTimeField: `${orderDate}T00:00:00`,
        documentStatusCodeField: 2,
    };
}

export function gs1Line({ lineNumber, supplierCode, gtin, buyerCode = '10367034', description, quantity, unitExcl, unitIncl, deliveryDate = '2026-10-19', shipToGln = '6001001016001', shipToBranch = '1608', discounts = {}, withDetail = true }: Gs1LineInput) {
    return {
        lineItemNumberField: String(lineNumber),
        parentLineItemNumberField: null,
        ShipToLocation: 0,
        requestedQuantityField: { measurementUnitCodeField: null, codeListVersionField: null, valueField: quantity },
        netAmountField: money(roundTo2(Number(quantity) * Number(unitExcl))),
        netPriceField: money(roundTo2(Number(quantity) * Number(unitIncl))),
        monetaryAmountExcludingTaxesField: money(unitExcl),
        monetaryAmountIncludingTaxesField: money(unitIncl),
        transactionalTradeItemField: {
            tradeItemDescriptionField: { languageCodeField: null, codeListVersionField: null, valueField: description },
            gtinField: gtin,
            additionalTradeItemIdentificationField: [
                tradeId({ type: 'SUPPLIER_ASSIGNED_ITEMID', value: supplierCode }),
                tradeId({ type: 'BUYER_ASSIGNED_ITEMID', value: buyerCode }),
                tradeId({ type: 'BUYER_ASSIGNED_ITEM_DESCRIPTION', value: description }),
            ],
        },
        orderLineItemDetailField: withDetail ? [{
            requestedQuantityField: { measurementUnitCodeField: null, codeListVersionField: null, valueField: quantity },
            orderLogisticalInformationField: {
                shipFromField: null,
                shipToField: {
                    glnField: shipToGln,
                    additionalPartyIdentificationField: [
                        partyId({ type: 'BUYER_ASSIGNED_BRANCH_NUMBER', value: shipToBranch }),
                        partyId({ type: 'BUYER_ASSIGNED_BRANCH_DESCRIPTION', value: 'TEST STORE' }),
                    ],
                },
                orderLogisticalDateInformationField: {
                    requestedDeliveryDateRangeField: null,
                    requestedDeliveryDateTimeField: { dateField: `${deliveryDate}T00:00:00`, timeField: '0001-01-01T00:00:00', timeFieldSpecified: false },
                },
            },
            avpListField: ZERO_DISCOUNTS.map(([code, name]) => ({
                attributeNameField: 'ORDER_DISCOUNT', qualifierCodeNameField: 'Discount Indicator', qualifierCodeListField: code,
                qualifierCodeListVersionField: name, valueField: discounts[code] ?? '0.00',
            })),
        }] : null,
        avpListField: [
            { attributeNameField: 'BUYER_ASSIGNED_COSTPER', qualifierCodeNameField: null, qualifierCodeListField: null, qualifierCodeListVersionField: null, valueField: '1' },
            { attributeNameField: 'BUYER_ASSIGNED_UNITOFMEASURE', qualifierCodeNameField: null, qualifierCodeListField: null, qualifierCodeListVersionField: null, valueField: 'EA' },
        ],
    };
}

function partyId({ type, value }: { type: string; value: string }) {
    return { additionalPartyIdentificationTypeCodeField: type, codeListVersionField: null, valueField: value };
}

function tradeId({ type, value }: { type: string; value: string }) {
    return { additionalTradeItemIdentificationTypeCodeField: type, codeListVersionField: null, valueField: value };
}

function money(value: number | string) {
    return { currencyCodeField: 'ZAR', codeListVersionField: null, valueField: value };
}

function roundTo2(value: number): number {
    return Math.round(value * 100) / 100;
}

type Gs1OrderInput = { orderNumber: string; headerId?: string; branch?: string; storeName?: string; gln?: string; orderDate?: string; orderType?: string; lines: unknown[] };
type Gs1LineInput = {
    lineNumber: number; supplierCode: string; gtin: string; buyerCode?: string; description: string;
    quantity: number | string; unitExcl: number | string; unitIncl: number | string; deliveryDate?: string;
    shipToGln?: string; shipToBranch?: string; discounts?: Record<string, string>; withDetail?: boolean;
};
```

- [ ] **Step 2: Write the failing parser tests**

`test/gs1-orders.test.ts`:

```ts
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
```

Check the expected totals by hand:
- line totals excl. VAT: 30 + 202 + 100 = 332;
- line totals incl. VAT: 34.5 + 232.4 + 115 = 381.9.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-orders.test.ts`
Expected: FAIL, "Cannot find module '../src/lib/gs1-orders'" (or similar).

- [ ] **Step 4: Write the parser**

`src/lib/gs1-orders.ts`:

```ts
function parse(body: unknown): ShopriteOrders {
    if (body === undefined || body === null || body === '') {
        return { count: 0, createdAt: null, orderNumbers: '', orders: [] };
    }
    if (!isRecord(body)) {
        throw unexpected('the body is not a GS1 document');
    }
    const createdAt = text(recordAt(recordAt(body['standardBusinessDocumentHeaderField'])['documentIdentificationField'])['creationDateAndTimeField']);
    const orderField = body['orderField'];
    if (orderField === undefined || orderField === null) {
        return { count: 0, createdAt, orderNumbers: '', orders: [] };
    }
    if (!Array.isArray(orderField)) {
        throw unexpected('orderField is not a list');
    }
    const orders = orderField.map((raw, index) => toOrder({ raw, index }));
    return { count: orders.length, createdAt, orderNumbers: orders.map((order) => order.orderNumber).join(','), orders };
}

function toOrder({ raw, index }: { raw: unknown; index: number }): ShopriteOrder {
    const order = recordAt(raw);
    const identification = recordAt(order['orderIdentificationField']);
    const orderNumber = text(identification['entityIdentificationField']);
    if (orderNumber === null) {
        throw unexpected(`order ${index + 1} has no order number`);
    }
    const rawLines = order['orderLineItemField'];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
        throw unexpected(`order ${orderNumber} has no lines`);
    }
    const buyer = recordAt(order['buyerField']);
    const store = {
        branch: partyId({ ids: buyer['additionalPartyIdentificationField'], type: 'BUYER_ASSIGNED_IDENTIFIER_FOR_A_PARTY' }),
        name: partyId({ ids: buyer['additionalPartyIdentificationField'], type: 'BUYER_ASSIGNED_DESCRIPTION_FOR_A_PARTY' }),
        gln: text(buyer['glnField']),
    };
    const orderType = text(recordAt(order['orderTypeCodeField'])['valueField']);
    const lines = rawLines.map(toLine);
    const deliveryDates = lines.map((line) => line.deliveryDate).filter((date): date is string => date !== null).sort();
    return {
        orderNumber,
        headerId: partyId({ ids: recordAt(identification['contentOwnerField'])['additionalPartyIdentificationField'], type: 'BUYER_ASSIGNED_ORDER_HEADERID' }),
        orderType,
        orderDate: datePart(order['creationDateTimeField']),
        deliveryDate: deliveryDates[0] ?? null,
        store,
        lines,
        totalExclVat: sum(lines.map((line) => line.lineTotalExclVat)),
        totalInclVat: sum(lines.map((line) => line.lineTotalInclVat)),
        warnings: warningsFor({ orderType, storeGln: store.gln, lines, rawLines }),
    };
}

function toLine(raw: unknown): ShopriteOrderLine {
    const line = recordAt(raw);
    const item = recordAt(line['transactionalTradeItemField']);
    const itemIds = item['additionalTradeItemIdentificationField'];
    const logistics = recordAt(detailOf(line)['orderLogisticalInformationField']);
    const shipTo = logistics['shipToField'];
    const dates = recordAt(logistics['orderLogisticalDateInformationField']);
    return {
        lineNumber: num(line['lineItemNumberField']),
        supplierItemCode: tradeItemId({ ids: itemIds, type: 'SUPPLIER_ASSIGNED_ITEMID' }),
        gtin: text(item['gtinField']),
        buyerItemCode: tradeItemId({ ids: itemIds, type: 'BUYER_ASSIGNED_ITEMID' }),
        description: text(recordAt(item['tradeItemDescriptionField'])['valueField']),
        quantity: num(recordAt(line['requestedQuantityField'])['valueField']),
        uom: avpValue({ list: line['avpListField'], name: 'BUYER_ASSIGNED_UNITOFMEASURE' }),
        unitPriceExclVat: amount(line['monetaryAmountExcludingTaxesField']),
        unitPriceInclVat: amount(line['monetaryAmountIncludingTaxesField']),
        lineTotalExclVat: amount(line['netAmountField']),
        lineTotalInclVat: amount(line['netPriceField']),
        deliveryDate: datePart(recordAt(dates['requestedDeliveryDateTimeField'])['dateField']),
        shipTo: isRecord(shipTo)
            ? { branch: partyId({ ids: shipTo['additionalPartyIdentificationField'], type: 'BUYER_ASSIGNED_BRANCH_NUMBER' }), gln: text(shipTo['glnField']) }
            : null,
    };
}

function warningsFor({ orderType, storeGln, lines, rawLines }: { orderType: string | null; storeGln: string | null; lines: ShopriteOrderLine[]; rawLines: unknown[] }): string[] {
    const warnings: string[] = [];
    if (orderType !== null && orderType !== NORMAL_ORDER) {
        warnings.push(`Order type ${orderType}, not a normal order (${NORMAL_ORDER})`);
    }
    lines.forEach((line, index) => {
        if (line.shipTo?.gln && storeGln && line.shipTo.gln !== storeGln) {
            warnings.push(`Line ${line.lineNumber} ships to GLN ${line.shipTo.gln}, not the store's GLN ${storeGln}`);
        }
        for (const discount of discountsOf(rawLines[index])) {
            warnings.push(`Line ${line.lineNumber} has a ${discount.name} of ${discount.value}`);
        }
    });
    return warnings;
}

function discountsOf(rawLine: unknown): { name: string; value: string }[] {
    const list = detailOf(recordAt(rawLine))['avpListField'];
    if (!Array.isArray(list)) {
        return [];
    }
    return list.map(recordAt)
        .filter((entry) => entry['attributeNameField'] === 'ORDER_DISCOUNT' && (num(entry['valueField']) ?? 0) !== 0)
        .map((entry) => ({ name: text(entry['qualifierCodeListVersionField']) ?? 'discount', value: text(entry['valueField']) ?? '' }));
}

function detailOf(line: Record<string, unknown>): Record<string, unknown> {
    const details = line['orderLineItemDetailField'];
    return Array.isArray(details) ? recordAt(details[0]) : {};
}

function partyId({ ids, type }: { ids: unknown; type: string }): string | null {
    return idOfType({ ids, typeKey: 'additionalPartyIdentificationTypeCodeField', type });
}

function tradeItemId({ ids, type }: { ids: unknown; type: string }): string | null {
    return idOfType({ ids, typeKey: 'additionalTradeItemIdentificationTypeCodeField', type });
}

function idOfType({ ids, typeKey, type }: { ids: unknown; typeKey: string; type: string }): string | null {
    if (!Array.isArray(ids)) {
        return null;
    }
    const match = ids.map(recordAt).find((id) => id[typeKey] === type);
    return match === undefined ? null : text(match['valueField']);
}

function avpValue({ list, name }: { list: unknown; name: string }): string | null {
    if (!Array.isArray(list)) {
        return null;
    }
    const match = list.map(recordAt).find((entry) => entry['attributeNameField'] === name);
    return match === undefined ? null : text(match['valueField']);
}

function amount(value: unknown): number | null {
    return num(recordAt(value)['valueField']);
}

function num(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return null;
}

function text(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function datePart(value: unknown): string | null {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value) ?? '');
    return match ? match[1] : null;
}

function sum(values: (number | null)[]): number {
    const total = values.reduce<number>((running, value) => running + (value ?? 0), 0);
    return Math.round(total * 100) / 100;
}

function recordAt(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpected(reason: string): Error {
    return new Error(`Unexpected response from Shoprite: ${reason}`);
}

const NORMAL_ORDER = '220';

export const gs1Orders = { parse };

export type ShopriteOrders = { count: number; createdAt: string | null; orderNumbers: string; orders: ShopriteOrder[] };

export type ShopriteOrder = {
    orderNumber: string;
    headerId: string | null;
    orderType: string | null;
    orderDate: string | null;
    deliveryDate: string | null;
    store: { branch: string | null; name: string | null; gln: string | null };
    lines: ShopriteOrderLine[];
    totalExclVat: number;
    totalInclVat: number;
    warnings: string[];
};

export type ShopriteOrderLine = {
    lineNumber: number | null;
    supplierItemCode: string | null;
    gtin: string | null;
    buyerItemCode: string | null;
    description: string | null;
    quantity: number | null;
    uom: string | null;
    unitPriceExclVat: number | null;
    unitPriceInclVat: number | null;
    lineTotalExclVat: number | null;
    lineTotalInclVat: number | null;
    deliveryDate: string | null;
    shipTo: { branch: string | null; gln: string | null } | null;
};
```

- [ ] **Step 5: Run the parser tests and watch them pass**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-orders.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Change the Download Orders test to expect plain orders (failing)**

Replace the test in `test/download-orders.test.ts` with:

```ts
describe('downloadOrders', () => {
    beforeEach(() => sendRequest.mockReset());

    test('GETs /api/VendorOrder with the auth headers and returns plain orders', async () => {
        const line = gs1Line({ lineNumber: 1, supplierCode: 'CSL1388', gtin: '06001001438896', description: 'KEY CONTROL 5PACK BOOK', quantity: 1, unitExcl: 30, unitIncl: 34.5 });
        sendRequest.mockResolvedValue({ status: 200, body: gs1Document({ orders: [gs1Order({ orderNumber: '1221181491', lines: [line] })] }) });
        const ctx = { ...createMockActionContext({ propsValue: {} }), auth };
        const result = await downloadOrders.run(ctx);
        expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://x/b2bservice/api/VendorOrder',
            headers: expect.objectContaining({ ContractID: 'c', UIUser: 'u' }),
        }));
        expect(result.output).toMatchObject({ count: 1, orderNumbers: '1221181491', orders: [{ orderNumber: '1221181491', lines: [{ gtin: '06001001438896' }] }] });
        expect(JSON.stringify(result)).not.toContain('orderLineItemField');
    });

    test('an unexpected body fails the step with a clear message', async () => {
        sendRequest.mockResolvedValue({ status: 200, body: '<html>Error</html>' });
        const ctx = { ...createMockActionContext({ propsValue: { onFailure: 'continue' } }), auth };
        const result = await downloadOrders.run(ctx);
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from Shoprite: the body is not a GS1 document' } });
    });
});
```

Add `import { gs1Document, gs1Line, gs1Order } from './fixtures/gs1';` to the imports.

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/download-orders.test.ts`
Expected: FAIL. The output is still the raw body.

- [ ] **Step 7: Make Download Orders parse**

In `src/lib/actions/download-orders.ts`:
- import `gs1Orders` from `'../gs1-orders'`;
- change the description to `'Download new (un-acknowledged) orders as plain orders: store, delivery date, and lines with item codes, GTIN, quantity and prices. Downloading does not acknowledge them.'`;
- change `work` to:

```ts
            work: async (trace) =>
                gs1Orders.parse(await shopriteClient.call<unknown>({ trace, auth, method: HttpMethod.GET, path: '/api/VendorOrder' })),
```

- [ ] **Step 8: Run the whole Shoprite suite, the type check and the lint**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: all tests pass, and no type or lint errors. If `test/trace.test.ts` asserted the old raw Download Orders output, update that expectation to the parsed shape. Its point is the redaction, not the body.

- [ ] **Step 9: Commit**

```bash
git add packages/pieces/custom/shoprite
git commit -m "feat(shoprite): Download Orders returns plain orders parsed from GS1"
```

---

### Task 2: JRNY · Resolve Order Lines

**Files:**
- Modify: `packages/pieces/custom/jrny/src/lib/client.ts`
- Create: `packages/pieces/custom/jrny/src/lib/actions/resolve-order-lines.ts`
- Create: `packages/pieces/custom/jrny/test/resolve-order-lines.test.ts`
- Modify: `packages/pieces/custom/jrny/src/index.ts`

**Interfaces:**
- Produces:
  - `jrnyClient.find<T>({ trace, auth, path }): Promise<T | null>`: GET; returns `null` on any 404, and throws the usual JRNY error otherwise.
  - action `resolveOrderLines` (name `resolve_order_lines`), output `{ addressCode: string; addressFallback: boolean; lines: { stockCode: string; qty: number; unitPrice?: number; reference: string; matchedBy: 'stockCode' | 'barcode' }[]; lineCount: number; dropped: { reference: string; description: string | null; stockCode: string | null; barcode: string | null; reason: string }[]; clean: boolean; notes: string }`.

- [ ] **Step 1: Write the failing tests**

`test/resolve-order-lines.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { resolveOrderLines } from '../src/lib/actions/resolve-order-lines';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };
const BASE = 'https://jrny/api/v1/integration/entities/ent-1';
const ADDRESSES = `${BASE}/customers/SHOE100/addresses`;

function httpError({ status, data }: { status: number; data: unknown }) {
    const config = { headers: new AxiosHeaders() };
    return new HttpError({}, new AxiosError('HTTP error', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

const notFound = () => httpError({ status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } });

function routes(table: Record<string, unknown>) {
    sendRequest.mockImplementation(async (req: { url: string }) => {
        const answer = table[req.url];
        if (answer === undefined) throw notFound();
        if (answer instanceof Error) throw answer;
        return { status: 200, body: answer };
    });
}

function urls(): string[] {
    return sendRequest.mock.calls.map((call) => call[0].url);
}

const shoe100 = { data: [{ addressCode: '1608' }, { addressCode: '0001' }], total: 2 };
const product = (stockCode: string, extra: Record<string, unknown> = {}) => ({ stockCode, description: stockCode, isActive: true, ...extra });

function run(props: Record<string, unknown>) {
    const propsValue = { customerCode: 'SHOE100', addressCode: '1608', notePrefix: 'Shoprite PO 1221181491, TEST STORE (1608)', ...props };
    return resolveOrderLines.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('resolveOrderLines', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('a stock code JRNY knows goes through, with Shoprite\'s price', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [{ stockCode: 'CSL1388', barcode: '06001001438896', quantity: 2, unitPrice: 30, description: 'KEY CONTROL', reference: '1' }] });
        expect(result.output).toEqual({
            addressCode: '1608', addressFallback: false,
            lines: [{ stockCode: 'CSL1388', qty: 2, unitPrice: 30, reference: '1', matchedBy: 'stockCode' }],
            lineCount: 1, dropped: [], clean: true, notes: 'Shoprite PO 1221181491, TEST STORE (1608).',
        });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('an unknown stock code falls back to the barcode, sent exactly as given', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: product('XSTAMP25') });
        const result = await run({ lines: [{ stockCode: 'OLDCODE', barcode: '06001224126747', quantity: 1, unitPrice: 50, description: 'X STAMPER', reference: '3' }] });
        expect(urls()).toContain(`${BASE}/products/by-barcode/06001224126747`);
        expect(result.output).toMatchObject({ lines: [{ stockCode: 'XSTAMP25', matchedBy: 'barcode', reference: '3' }], clean: true });
    });

    test('a blank stock code goes straight to the barcode', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: product('XSTAMP25') });
        await run({ lines: [{ stockCode: '', barcode: '06001224126747', quantity: 1, reference: '3' }] });
        expect(urls()).toEqual([ADDRESSES, `${BASE}/products/by-barcode/06001224126747`]);
    });

    test('a line found by neither is dropped and named in the notes', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [
            { stockCode: 'CSL1388', quantity: 1, unitPrice: 30, reference: '1' },
            { stockCode: '', barcode: '06001224126747', quantity: 2, description: 'X STAMPER BOOK PK25', reference: '3' },
        ] });
        expect(result.output).toMatchObject({
            lineCount: 1, clean: false,
            dropped: [{ reference: '3', description: 'X STAMPER BOOK PK25', stockCode: null, barcode: '06001224126747', reason: 'item not found' }],
            notes: 'Shoprite PO 1221181491, TEST STORE (1608).\nNot loaded: line 3 X STAMPER BOOK PK25 (barcode 06001224126747): item not found.',
        });
    });

    test('a 404 without a JRNY error body (e.g. the barcode route not deployed yet) counts as not found', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/by-barcode/06001224126747`]: httpError({ status: 404, data: { statusCode: 404, message: 'Cannot GET' } }) });
        const result = await run({ lines: [{ barcode: '06001224126747', quantity: 1, reference: '3' }] });
        expect(result.output).toMatchObject({ dropped: [{ reason: 'item not found' }] });
    });

    test('an inactive product is dropped', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/OLD1`]: product('OLD1', { isActive: false }) });
        const result = await run({ lines: [{ stockCode: 'OLD1', quantity: 1, reference: '1' }] });
        expect(result.output).toMatchObject({ dropped: [{ stockCode: 'OLD1', reason: 'inactive in JRNY' }], lineCount: 0 });
    });

    test('a quantity of 0 is dropped without looking the item up', async () => {
        routes({ [ADDRESSES]: shoe100 });
        const result = await run({ lines: [{ stockCode: 'CSL1388', quantity: 0, reference: '1' }] });
        expect(result.output).toMatchObject({ dropped: [{ reason: 'quantity must be more than 0' }] });
        expect(urls()).toEqual([ADDRESSES]);
    });

    test('an unknown or blank delivery address uses the fallback, and says so', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const line = { stockCode: 'CSL1388', quantity: 1, reference: '1' };
        const unknown = await run({ addressCode: 'G622', lines: [line] });
        expect(unknown.output).toMatchObject({ addressCode: '0001', addressFallback: true, clean: false });
        expect(unknown.output?.notes).toContain('Delivery address G622 not found; used 0001.');
        const blank = await run({ addressCode: '', fallbackAddressCode: 'HQ', lines: [line] });
        expect(blank.output).toMatchObject({ addressCode: 'HQ', addressFallback: true });
    });

    test('an unknown customer fails the step', async () => {
        routes({});
        const result = await run({ customerCode: 'SHOE100', onFailure: 'continue', lines: [] });
        expect(result).toMatchObject({ ok: false, error: { status: 404 } });
    });

    test('a JRNY server error fails the step instead of dropping lines', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: httpError({ status: 500, data: { error: { code: 'INTERNAL', message: 'boom' } } }) });
        const result = await run({ onFailure: 'continue', lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }] });
        expect(result).toMatchObject({ ok: false, error: { status: 500 } });
    });

    test('looks each code up once, even on repeated lines', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        await run({ lines: [{ stockCode: 'CSL1388', quantity: 1, reference: '1' }, { stockCode: 'CSL1388', quantity: 3, reference: '2' }] });
        expect(urls().filter((url) => url.endsWith('/products/CSL1388'))).toHaveLength(1);
    });

    test('encodes a stock code with a slash', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/1%2FSEALS`]: product('1/SEALS') });
        const result = await run({ lines: [{ stockCode: '1/SEALS', quantity: 20, reference: '7' }] });
        expect(result.output).toMatchObject({ lines: [{ stockCode: '1/SEALS', qty: 20 }] });
    });

    test('leaves the unit price out when the line has none, so JRNY prices it', async () => {
        routes({ [ADDRESSES]: shoe100, [`${BASE}/products/CSL1388`]: product('CSL1388') });
        const result = await run({ lines: [{ stockCode: 'CSL1388', quantity: 1, unitPrice: null, reference: '1' }] });
        expect(result.output?.lines[0]).toEqual({ stockCode: 'CSL1388', qty: 1, reference: '1', matchedBy: 'stockCode' });
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/resolve-order-lines.test.ts`
Expected: FAIL, module `../src/lib/actions/resolve-order-lines` not found.

- [ ] **Step 3: Add `jrnyClient.find`, sharing one send helper**

In `src/lib/client.ts`:
- replace the bodies of `request` and `callJrny` so that both build a URL and call a new non-exported `send`;
- add `find`.

The call shapes stay the same, and `callJrny` gains optional `headers` (used in Task 3):

```ts
async function request<T>({ trace, auth, method, path, query, body }: JrnyRequest): Promise<T> {
  return send<T>({ trace, auth, method, url: joinUrl(auth.baseUrl, path), query, body });
}

async function callJrny<T>({ trace, auth, method, path, body, headers }: CallJrnyParams): Promise<T> {
  return send<T>({ trace, auth, method, url: `${trimTrailingSlash(auth.baseUrl)}${path}`, body, headers });
}

// A missing record and a route JRNY has not deployed yet both answer 404; to a lookup both mean "not there".
async function find<T>({ trace, auth, path }: { trace: Tracer; auth: JrnyAuth; path: string }): Promise<T | null> {
  const url = joinUrl(auth.baseUrl, path);
  try {
    const response = await trace.send<T>({ request: buildRequest({ auth, method: HttpMethod.GET, url }) });
    return response.body;
  } catch (err) {
    if (err instanceof HttpError && err.response?.status === 404) {
      return null;
    }
    throw toJrnyError({ err, method: HttpMethod.GET, url });
  }
}

async function send<T>({ trace, auth, method, url, query, body, headers }: SendParams): Promise<T> {
  try {
    const response = await trace.send<T>({ request: buildRequest({ auth, method, url, query, body, headers }) });
    return response.body;
  } catch (err) {
    throw toJrnyError({ err, method, url });
  }
}

function buildRequest({ auth, method, url, query, body, headers }: Omit<SendParams, 'trace'>): HttpRequest {
  return {
    method,
    url,
    authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
    headers: { 'Content-Type': 'application/json', ...headers },
    queryParams: query,
    body,
  };
}
```

Also:
- import `HttpRequest` from `@activepieces/pieces-common`;
- export `find` in `jrnyClient`: `export const jrnyClient = { callJrny, request, find, joinUrl, secretsOf };`;
- add `headers?: Record<string, string>;` to `CallJrnyParams`;
- add the type at the end of the file:

```ts
type SendParams = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  url: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};
```

`callJrny` previously sent no `queryParams`. `queryParams: undefined` is equivalent. Check: the existing `trace.test.ts` "records the PATCH" expectation (`query: {}`) still passes in Step 7.

- [ ] **Step 4: Write the action**

`src/lib/actions/resolve-order-lines.ts`:

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { jrnyAuth, JrnyAuth } from '../auth';
import { jrnyClient } from '../client';

// Declared before the action because its props read it when the module loads.
const DEFAULT_FALLBACK = '0001';

export const resolveOrderLines = createAction({
  auth: jrnyAuth,
  name: 'resolve_order_lines',
  displayName: 'Resolve Order Lines',
  description:
    "Checks an incoming order's delivery address and items against JRNY before creating the quote. An unknown address uses the fallback; an item is found by stock code, then barcode, or left out. Returns lines ready for Create Quote, what was left out, and notes for the quote.",
  props: {
    customerCode: Property.ShortText({ displayName: 'Customer Code', description: 'e.g. SHOE100', required: true }),
    addressCode: Property.ShortText({ displayName: 'Delivery Address Code', description: "The customer's address code for this order, e.g. the store branch 1608.", required: false }),
    fallbackAddressCode: Property.ShortText({ displayName: 'Fallback Address Code', description: 'Used when the delivery address is not on the customer. Defaults to 0001.', required: false, defaultValue: DEFAULT_FALLBACK }),
    notePrefix: Property.ShortText({ displayName: 'Note Prefix', description: 'First line of the notes, e.g. Shoprite PO 1221181491, CHECKERS SCOTTSVILLE (1608).', required: false }),
    lines: Property.Array({
      displayName: 'Lines',
      required: false,
      properties: {
        stockCode: Property.ShortText({ displayName: 'Stock Code', required: false }),
        barcode: Property.ShortText({ displayName: 'Barcode', description: 'Used exactly as given when the stock code is not found.', required: false }),
        quantity: Property.Number({ displayName: 'Quantity', required: true }),
        unitPrice: Property.Number({ displayName: 'Unit Price (excl. VAT)', required: false }),
        description: Property.ShortText({ displayName: 'Description', required: false }),
        reference: Property.ShortText({ displayName: 'Reference', description: 'e.g. the order line number', required: false }),
      },
    }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const entity = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}`;
        const addresses = await jrnyClient.request<unknown>({
          trace, auth, method: HttpMethod.GET, path: `${entity}/customers/${encodeURIComponent(p.customerCode.trim())}/addresses`,
        });
        const wanted = (p.addressCode ?? '').trim();
        const addressFallback = !addressCodesOf(addresses).includes(wanted);
        const addressCode = addressFallback ? (p.fallbackAddressCode ?? '').trim() || DEFAULT_FALLBACK : wanted;
        const lookup = productLookup({ trace, auth, entity });
        const lines: ResolvedLine[] = [];
        const dropped: DroppedLine[] = [];
        for (const [index, line] of linesOf(p.lines).entries()) {
          const outcome = await resolveLine({ line, reference: line.reference ?? String(index + 1), lookup });
          if ('reason' in outcome) {
            dropped.push(outcome);
          } else {
            lines.push(outcome);
          }
        }
        return {
          addressCode,
          addressFallback,
          lines,
          lineCount: lines.length,
          dropped,
          clean: !addressFallback && dropped.length === 0,
          notes: notesFor({ prefix: (p.notePrefix ?? '').trim(), wanted, addressCode, addressFallback, dropped }),
        };
      },
    });
  },
});

async function resolveLine({ line, reference, lookup }: { line: InputLine; reference: string; lookup: ProductLookup }): Promise<ResolvedLine | DroppedLine> {
  const drop = (reason: string): DroppedLine => ({ reference, description: line.description, stockCode: line.stockCode, barcode: line.barcode, reason });
  if (line.quantity === null || line.quantity <= 0) {
    return drop('quantity must be more than 0');
  }
  let matchedBy: ResolvedLine['matchedBy'] = 'stockCode';
  let product = line.stockCode === null ? null : await lookup({ kind: 'stockCode', value: line.stockCode });
  if (product === null && line.barcode !== null) {
    matchedBy = 'barcode';
    product = await lookup({ kind: 'barcode', value: line.barcode });
  }
  if (product === null) {
    return drop('item not found');
  }
  if (!product.isActive) {
    return drop('inactive in JRNY');
  }
  return { stockCode: product.stockCode, qty: line.quantity, ...(line.unitPrice === null ? {} : { unitPrice: line.unitPrice }), reference, matchedBy };
}

function productLookup({ trace, auth, entity }: { trace: Tracer; auth: JrnyAuth; entity: string }): ProductLookup {
  const cache = new Map<string, Promise<Product | null>>();
  return ({ kind, value }) => {
    const key = `${kind}:${value}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const path = kind === 'stockCode' ? `${entity}/products/${encodeURIComponent(value)}` : `${entity}/products/by-barcode/${encodeURIComponent(value)}`;
    const pending = jrnyClient.find<unknown>({ trace, auth, path }).then((body) => (body === null ? null : productOf(body)));
    cache.set(key, pending);
    return pending;
  };
}

function productOf(body: unknown): Product {
  if (!isRecord(body) || typeof body['stockCode'] !== 'string') {
    throw new Error('Unexpected response from JRNY: a product without a stock code');
  }
  return { stockCode: body['stockCode'], isActive: body['isActive'] !== false };
}

function addressCodesOf(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body['data'])) {
    throw new Error('Unexpected response from JRNY: the customer addresses are not a list');
  }
  return body['data'].flatMap((address) => (isRecord(address) && typeof address['addressCode'] === 'string' ? [address['addressCode']] : []));
}

function linesOf(value: unknown): InputLine[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((line) => ({
    stockCode: textOf(line['stockCode']),
    barcode: textOf(line['barcode']),
    quantity: numberOf(line['quantity']),
    unitPrice: numberOf(line['unitPrice']),
    description: textOf(line['description']),
    reference: textOf(line['reference']),
  }));
}

function notesFor({ prefix, wanted, addressCode, addressFallback, dropped }: { prefix: string; wanted: string; addressCode: string; addressFallback: boolean; dropped: DroppedLine[] }): string {
  const notes: string[] = [];
  if (prefix !== '') {
    notes.push(/[.!?]$/.test(prefix) ? prefix : `${prefix}.`);
  }
  if (addressFallback) {
    notes.push(`Delivery address ${wanted === '' ? '(blank)' : wanted} not found; used ${addressCode}.`);
  }
  for (const line of dropped) {
    const ids = [line.stockCode && `stock code ${line.stockCode}`, line.barcode && `barcode ${line.barcode}`].filter(Boolean).join(', ');
    notes.push(`Not loaded: line ${line.reference}${line.description ? ` ${line.description}` : ''}${ids ? ` (${ids})` : ''}: ${line.reason}.`);
  }
  return notes.join('\n');
}

function textOf(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type InputLine = { stockCode: string | null; barcode: string | null; quantity: number | null; unitPrice: number | null; description: string | null; reference: string | null };
type Product = { stockCode: string; isActive: boolean };
type ProductLookup = (query: { kind: 'stockCode' | 'barcode'; value: string }) => Promise<Product | null>;
type ResolvedLine = { stockCode: string; qty: number; unitPrice?: number; reference: string; matchedBy: 'stockCode' | 'barcode' };
type DroppedLine = { reference: string; description: string | null; stockCode: string | null; barcode: string | null; reason: string };
```

- [ ] **Step 5: Register the action**

In `src/index.ts`, import `resolveOrderLines` from `'./lib/actions/resolve-order-lines'` and add it after `listCourierDispatches` in `actions`.

- [ ] **Step 6: Run the new tests and watch them pass**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/resolve-order-lines.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 7: Run the whole JRNY suite, the type check and the lint**

Run: `cd packages/pieces/custom/jrny && bunx vitest run && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: all pass, including `trace.test.ts`'s exact `sent` expectations after the client refactor.

- [ ] **Step 8: Commit**

```bash
git add packages/pieces/custom/jrny
git commit -m "feat(jrny): Resolve Order Lines checks address and items with fallbacks before a quote"
```

---

### Task 3: JRNY · Create Quote gains delivery date, auto-confirm and an idempotency key

**Files:**
- Modify: `packages/pieces/custom/jrny/src/lib/actions/create-quote.ts`
- Create: `packages/pieces/custom/jrny/test/create-quote.test.ts`

**Interfaces:**
- Consumes: `jrnyClient.callJrny({ …, headers })` from Task 2.
- Produces: new Create Quote props `deliveryDate` (text), `autoConfirm` (checkbox), `idempotencyKey` (text).

- [ ] **Step 1: Write the failing tests**

`test/create-quote.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { createQuote } from '../src/lib/actions/create-quote';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };
const base = { customerCode: 'SHOE100', lines: [{ stockCode: 'CSL1388', qty: 1, unitPrice: 30 }] };

function run(props: Record<string, unknown>) {
    return createQuote.run({ ...createMockActionContext({ propsValue: { ...base, ...props } }), auth });
}

function sent() {
    return sendRequest.mock.calls[0][0];
}

describe('createQuote', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        sendRequest.mockResolvedValue({ status: 201, body: { quotationNumber: 'Q-1' } });
    });

    test('sends the delivery date, auto-confirm and the idempotency key', async () => {
        await run({ autoConvert: true, autoConfirm: true, deliveryDate: '2026-10-19', idempotencyKey: 'shoprite-1221181491' });
        expect(sent().body).toMatchObject({ autoConvert: true, autoConfirm: true, deliveryDate: '2026-10-19' });
        expect(sent().headers).toMatchObject({ 'Idempotency-Key': 'shoprite-1221181491' });
    });

    test('accepts auto-confirm given as the text true from an expression', async () => {
        await run({ autoConvert: 'true', autoConfirm: 'true', deliveryDate: '2026-10-19' });
        expect(sent().body).toMatchObject({ autoConvert: true, autoConfirm: true });
    });

    test('auto-confirm off, or false as text, sends no autoConfirm', async () => {
        await run({ autoConvert: true, autoConfirm: 'false', deliveryDate: '2026-10-19' });
        expect(sent().body).not.toHaveProperty('autoConfirm');
    });

    test.each([
        [{ autoConfirm: true, deliveryDate: '2026-10-19' }, 'Auto-confirm needs Auto-convert to Sales Order turned on'],
        [{ autoConvert: true, autoConfirm: true }, 'Auto-confirm needs a Delivery Date'],
        [{ deliveryDate: '19/10/2026' }, 'Delivery Date must be YYYY-MM-DD, e.g. 2026-10-19'],
    ])('rejects %j before calling JRNY', async (props, message) => {
        const result = await run({ ...props, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('without the new inputs the request is unchanged', async () => {
        await run({});
        expect(sent().body).toEqual({ customer: { code: 'SHOE100' }, lines: [{ stockCode: 'CSL1388', qty: 1, unitPrice: 30 }] });
        expect(sent().headers).not.toHaveProperty('Idempotency-Key');
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/create-quote.test.ts`
Expected: FAIL. The new fields aren't sent and the checks don't exist; the "unchanged" test passes already.

- [ ] **Step 3: Add the props and send them**

In `create-quote.ts`, add the props after `autoConvert`:

```ts
    autoConfirm: Property.Checkbox({
      displayName: 'Auto-confirm Sales Order',
      description: 'Confirm the sales order straight away (runs the credit check). Needs Auto-convert and a Delivery Date. Can be set from a field, e.g. {{step_N.output.clean}}.',
      required: false,
      defaultValue: false,
    }),
    deliveryDate: Property.ShortText({
      displayName: 'Delivery Date',
      description: 'Required delivery date, YYYY-MM-DD.',
      required: false,
    }),
    idempotencyKey: Property.ShortText({
      displayName: 'Idempotency Key',
      description: 'The same key twice creates one quote, e.g. shoprite-{{orderNumber}}.',
      required: false,
    }),
```

In `run`'s `work`, before `const lines`, add the checks:

```ts
        const autoConvert = isOn(p.autoConvert);
        const autoConfirm = isOn(p.autoConfirm);
        const deliveryDate = (p.deliveryDate ?? '').trim();
        if (deliveryDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
          throw new Error('Delivery Date must be YYYY-MM-DD, e.g. 2026-10-19');
        }
        if (autoConfirm && !autoConvert) {
          throw new Error('Auto-confirm needs Auto-convert to Sales Order turned on');
        }
        if (autoConfirm && deliveryDate === '') {
          throw new Error('Auto-confirm needs a Delivery Date');
        }
```

Replace `if (p.autoConvert) body['autoConvert'] = true;` with:

```ts
        if (autoConvert) body['autoConvert'] = true;
        if (autoConfirm) body['autoConfirm'] = true;
        if (deliveryDate !== '') body['deliveryDate'] = deliveryDate;
```

Replace the `return jrnyClient.callJrny(…)` with:

```ts
        const idempotencyKey = (p.idempotencyKey ?? '').trim();
        const headers = idempotencyKey === '' ? undefined : { 'Idempotency-Key': idempotencyKey };
        return jrnyClient.callJrny({ trace, auth, method: HttpMethod.POST, path, body, headers });
```

Add the helper after `buildDeliveryAddress`:

```ts
// A checkbox set from an expression arrives as the text "true" or "false".
function isOn(value: unknown): boolean {
  return value === true || value === 'true';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/create-quote.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole JRNY suite, the type check and the lint**

Run: `cd packages/pieces/custom/jrny && bunx vitest run && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/pieces/custom/jrny
git commit -m "feat(jrny): Create Quote sends delivery date, auto-confirm and an idempotency key"
```

---

### Task 4: JRNY · Generate Pick

**Files:**
- Create: `packages/pieces/custom/jrny/src/lib/actions/generate-pick.ts`
- Create: `packages/pieces/custom/jrny/test/generate-pick.test.ts`
- Modify: `packages/pieces/custom/jrny/src/index.ts`

**Interfaces:**
- Consumes: `jrnyClient.request` (unchanged signature).
- Produces: action `generatePick` (name `generate_pick`). Its output is JRNY's response body.

- [ ] **Step 1: Write the failing tests**

`test/generate-pick.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { jrny } from '../src';
import { generatePick } from '../src/lib/actions/generate-pick';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };

function run(propsValue: Record<string, unknown>) {
    return generatePick.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('generatePick', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('POSTs generate-pick for the sales order and returns the pick', async () => {
        sendRequest.mockResolvedValueOnce({ status: 201, body: { pickNumber: 'PK-1', lines: [] } });
        const result = await run({ salesOrderNumber: ' SO/0042 ' });
        expect(sendRequest.mock.calls[0][0]).toMatchObject({
            method: 'POST', url: 'https://jrny/api/v1/integration/entities/ent-1/sales-orders/SO%2F0042/generate-pick',
        });
        expect(result.output).toEqual({ pickNumber: 'PK-1', lines: [] });
    });

    test('a 409 (not confirmed, or already picked) comes back with its code for a Router', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config,
            data: { error: { code: 'SALES_ORDER_NOT_CONFIRMED', message: 'Sales order is not confirmed' } },
        })));
        const result = await run({ salesOrderNumber: 'SO-1', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { status: 409, code: 'SALES_ORDER_NOT_CONFIRMED' } });
    });

    test('a blank sales order number fails before calling JRNY', async () => {
        const result = await run({ salesOrderNumber: '  ', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Sales Order Number is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('the piece lists Resolve Order Lines and Generate Pick once each', () => {
        const names = Object.keys(jrny.actions());
        expect(names.filter((name) => name === 'generate_pick')).toHaveLength(1);
        expect(names).toContain('resolve_order_lines');
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/generate-pick.test.ts`
Expected: FAIL, module `../src/lib/actions/generate-pick` not found.

- [ ] **Step 3: Write the action**

`src/lib/actions/generate-pick.ts`:

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';

export const generatePick = createAction({
  auth: jrnyAuth,
  name: 'generate_pick',
  displayName: 'Generate Pick',
  description:
    "Creates the picking instruction for a confirmed sales order, with JRNY's own pick rules. A sales order that is not confirmed, or already has a pick, gives a 409 instead of a second pick.",
  props: {
    salesOrderNumber: Property.ShortText({ displayName: 'Sales Order Number', required: true }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const orderNumber = (p.salesOrderNumber ?? '').trim();
        if (orderNumber === '') {
          throw new Error('Sales Order Number is required');
        }
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/sales-orders/${encodeURIComponent(orderNumber)}/generate-pick`;
        return jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.POST, path });
      },
    });
  },
});
```

- [ ] **Step 4: Register it, and keep a future generated duplicate out**

In `src/index.ts`:
- import `generatePick` from `'./lib/actions/generate-pick'`;
- add it after `resolveOrderLines` in `actions`;
- extend the generated-actions filter so a later spec regeneration can't add a second `generate_pick`:

```ts
const CURATED = ['create_quotation', 'courier_response', 'generate_pick'];
const generatedActions = jrnyOperations.filter((op) => !CURATED.includes(op.name)).map(buildJrnyAction);
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd packages/pieces/custom/jrny && bunx vitest run test/generate-pick.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the whole JRNY suite, the type check and the lint**

Run: `cd packages/pieces/custom/jrny && bunx vitest run && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/pieces/custom/jrny
git commit -m "feat(jrny): Generate Pick for a confirmed sales order"
```

---

### Task 5: Builder notes for the flow

**Files:**
- Create: `docs/integrations/shoprite/orders-flow.md`

No code, so no test cycle. This is the builder-facing version of the spec's flow, so whoever builds it in UAT doesn't need the spec.

- [ ] **Step 1: Write the notes**

`docs/integrations/shoprite/orders-flow.md`:

````markdown
# Shoprite orders → JRNY: building the flow

Design: `docs/superpowers/specs/2026-10-17-shoprite-orders-design.md`.

**Until the switch-over:**
- use the JRNY **dev** connection;
- never add Shoprite **Acknowledge Orders**;
- downloading is read-only, so every run sees the same orders, and step 4 skips the ones already loaded.

| # | Step | Settings |
| --- | --- | --- |
| trigger | Schedule, cron | `0 8,16 * * *`, Africa/Johannesburg |
| 1 | Shoprite · Download Orders | If the call fails: Stop |
| 2 | Router | `{{step_1.output.count}}` > 0 |
| 3 | Loop on Items | `{{step_1.output.orders}}` |
| 4 | JRNY · List Quotations | External Ref = `{{step_3.item.orderNumber}}` |
| 5 | Router | `{{step_4.output.data}}` list is empty, otherwise skip |
| 6 | JRNY · Resolve Order Lines | Customer `SHOE100`; Delivery Address `{{step_3.item.store.branch}}`; Fallback `0001`; Note Prefix `Shoprite PO {{step_3.item.orderNumber}}, {{step_3.item.store.name}} ({{step_3.item.store.branch}})`; Lines in list-mapper mode from `step_3.item.lines`: Stock Code ← `supplierItemCode`, Barcode ← `gtin`, Quantity ← `quantity`, Unit Price ← `unitPriceExclVat`, Description ← `description`, Reference ← `lineNumber`. If the call fails: Continue |
| 7 | Router | `{{step_6.ok}}` is true AND `{{step_6.output.lineCount}}` > 0 |
| 8 | JRNY · Create Quote | Customer `SHOE100`; Delivery Address by code `{{step_6.output.addressCode}}`; Lines in list-mapper mode from `step_6.output.lines` (stockCode, qty, unitPrice); External Reference `{{step_3.item.orderNumber}}`; Delivery Date `{{step_3.item.deliveryDate}}`; Notes `{{step_6.output.notes}}`; Auto-convert on; Auto-confirm `{{step_6.output.clean}}`; Idempotency Key `shoprite-{{step_3.item.orderNumber}}`. If the call fails: Continue |
| 9 | Router | `{{step_8.ok}}` is true AND `{{step_6.output.clean}}` is true |
| 10 | JRNY · Generate Pick | Sales Order Number from step 8's output (find the field with Test step, under `salesOrder`). If the call fails: Continue |

**Test it like this:**
1. Test step 1 against production. It's read-only.
2. Run steps 6–10 for two or three real orders against JRNY dev: one clean order, and one containing X STAMPER BOOK PK25 (no AON code).
3. In JRNY, check:
   - a confirmed sales order with a pick for the clean order;
   - a draft for the other, with the "Not loaded" note.
4. Run the flow again: step 5 should skip both.
````

- [ ] **Step 2: Commit**

```bash
git add docs/integrations/shoprite/orders-flow.md
git commit -m "docs(shoprite): builder notes for the orders flow"
```
