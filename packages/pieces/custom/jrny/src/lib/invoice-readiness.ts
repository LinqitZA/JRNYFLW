function screen(row: unknown): SkipReason | null {
    const record = asRecord(row);
    if (textOf(record['customerPoNumber']) === null) {
        return 'noPurchaseOrder';
    }
    const delivery = asRecord(record['apiDelivery']);
    // An UNCONFIRMED invoice may already be in Shoprite; a person checks and resets it, and a reset invoice comes back unsent.
    if (delivery['status'] === 'failed' && (textOf(delivery['lastMessage']) ?? '').startsWith('UNCONFIRMED')) {
        return 'unconfirmed';
    }
    return null;
}

function assess({ detail, dispatches }: { detail: unknown; dispatches: unknown[] }): Assessment {
    const invoice = asRecord(detail);
    if (textOf(invoice['salesOrderNumber']) === null) {
        return { kind: 'waiting', reason: 'noSalesOrder' };
    }
    if (dispatches.length === 0) {
        return { kind: 'waiting', reason: 'noDispatch' };
    }
    // JRNY's shipping.delivered fires when the invoice is raised, so only the courier's POD proves delivery.
    if (!dispatches.every((dispatch) => hasPod(asRecord(dispatch)))) {
        return { kind: 'waiting', reason: 'notDelivered' };
    }
    const problems: string[] = [];
    const address = invoice['deliveryAddress'];
    const addressCode = isRecord(address) ? textOf(address['code']) : null;
    const storeGln = isRecord(address) ? textOf(address['gln']) : null;
    if (!isRecord(address)) {
        problems.push('The invoice has no delivery address in JRNY');
    } else if (storeGln === null) {
        problems.push(`Delivery address ${addressCode ?? '(no code)'} has no GLN in JRNY`);
    }
    const lines = (Array.isArray(invoice['lines']) ? invoice['lines'] : []).map((raw) => readyLine({ raw: asRecord(raw), problems }));
    const problem = problems.length === 0 ? null : problems.join('; ');
    return {
        kind: 'ready',
        invoice: {
            invoiceNumber: textOf(invoice['invoiceNumber']) ?? '',
            invoiceDate: (textOf(invoice['invoiceDate']) ?? '').slice(0, 10),
            purchaseOrder: textOf(invoice['customerPoNumber']) ?? '',
            storeGln,
            deliveryAddressCode: addressCode,
            totalExclVat: numberOf(invoice['subtotal']),
            totalVat: numberOf(invoice['vatTotal']),
            totalInclVat: numberOf(invoice['total']),
            lines,
            clean: problem === null,
            problem,
        },
    };
}

function readyLine({ raw, problems }: { raw: Record<string, unknown>; problems: string[] }): ReadyLine {
    const lineText = textOf(raw['lineNumber']) ?? '?';
    const lineNumber = /^\d+$/.test(lineText) ? Number(lineText) : lineText;
    if (typeof lineNumber === 'string') {
        problems.push(`Line ${lineText}: the line number is not a whole number`);
    }
    const productCode = textOf(raw['productCode']);
    const uom = textOf(raw['uom']);
    // A default barcode is JRNY's fallback, not the GTIN Shoprite orders against, so it must never reach Shoprite.
    const gtin = raw['gtinSource'] === 'gtin' ? textOf(raw['gtin']) : null;
    if (gtin === null) {
        problems.push(`Line ${lineText} (${productCode ?? 'no product'}, ${uom ?? 'no unit'}): no Shoprite GTIN in JRNY`);
    }
    const exclVat = numberOf(raw['lineTotal']);
    return {
        lineNumber,
        quantity: numberOf(raw['quantity']),
        lineTotalExclVat: exclVat,
        lineTotalInclVat: Math.round((exclVat + numberOf(raw['vatAmount'])) * 100) / 100,
        description: textOf(raw['description']) ?? '',
        gtin,
        productCode,
        uom,
    };
}

function hasPod(dispatch: Record<string, unknown>): boolean {
    return textOf(dispatch['podSignedAt']) !== null || textOf(dispatch['podUrl']) !== null;
}

function textOf(value: unknown): string | null {
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text === '' ? null : text;
}

// JRNY documents amounts as numeric strings but sends numbers; both are read.
function numberOf(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

export const invoiceReadiness = { screen, assess };

export type SkipReason = 'noPurchaseOrder' | 'unconfirmed';
export type WaitReason = 'noSalesOrder' | 'noDispatch' | 'notDelivered';
export type ReadyLine = {
    lineNumber: number | string;
    quantity: number;
    lineTotalExclVat: number;
    lineTotalInclVat: number;
    description: string;
    gtin: string | null;
    productCode: string | null;
    uom: string | null;
};
export type ReadyInvoice = {
    invoiceNumber: string;
    invoiceDate: string;
    purchaseOrder: string;
    storeGln: string | null;
    deliveryAddressCode: string | null;
    totalExclVat: number;
    totalVat: number;
    totalInclVat: number;
    lines: ReadyLine[];
    clean: boolean;
    problem: string | null;
};
export type Assessment = { kind: 'waiting'; reason: WaitReason } | { kind: 'ready'; invoice: ReadyInvoice };
