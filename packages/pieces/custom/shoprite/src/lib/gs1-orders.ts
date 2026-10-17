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
