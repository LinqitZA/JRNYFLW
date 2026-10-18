function check(input: InvoiceInput): Invoice {
    const problems: string[] = [];
    const invoiceNumber = requiredText({ value: input.invoiceNumber, label: 'Invoice Number', problems });
    const invoiceDate = readInvoiceDate({ value: input.invoiceDate, problems });
    const purchaseOrder = requiredText({ value: input.purchaseOrder, label: 'Purchase Order', problems });
    const storeGln = readStoreGln({ value: input.storeGln, problems });
    const totals = readTotals({ input, problems });
    const lines = readLines({ value: input.lines, problems });
    if (problems.length === 0 && totals !== null) {
        compareTotals({ totals, lines, problems });
    }
    if (problems.length > 0 || totals === null) {
        throw new Error(problems.join('; '));
    }
    return { invoiceNumber, invoiceDate, purchaseOrder, storeGln, totals, lines };
}

function isGln(text: string): boolean {
    return /^\d{13}$/.test(text) && hasValidCheckDigit(text);
}

function requiredText({ value, label, problems }: FieldParams): string {
    const text = cleanText(value);
    if (text === '') {
        problems.push(`${label} is required`);
    }
    return text;
}

function readInvoiceDate({ value, problems }: { value: unknown; problems: string[] }): string {
    const text = requiredText({ value, label: 'Invoice Date', problems });
    if (text !== '' && !isRealDate(text)) {
        problems.push('Invoice Date must be YYYY-MM-DD, e.g. 2026-10-17');
    }
    return text;
}

function readStoreGln({ value, problems }: { value: unknown; problems: string[] }): string {
    const text = requiredText({ value, label: 'Store GLN', problems });
    if (text === '') {
        return text;
    }
    if (!/^\d{13}$/.test(text)) {
        problems.push(`Store GLN must be 13 digits: ${text}`);
    } else if (!hasValidCheckDigit(text)) {
        problems.push(`Store GLN ${text} has a wrong check digit`);
    }
    return text;
}

function readTotals({ input, problems }: { input: InvoiceInput; problems: string[] }): InvoiceTotals | null {
    const exclVatCents = centsField({ value: input.totalExclVat, label: 'Total Excl. VAT', problems });
    const vatCents = centsField({ value: input.totalVat, label: 'Total VAT', problems });
    const inclVatCents = centsField({ value: input.totalInclVat, label: 'Total Incl. VAT', problems });
    if (exclVatCents === null || vatCents === null || inclVatCents === null) {
        return null;
    }
    return { exclVatCents, vatCents, inclVatCents };
}

function readLines({ value, problems }: { value: unknown; problems: string[] }): InvoiceLine[] {
    if (!Array.isArray(value) || value.length === 0) {
        problems.push('The invoice has no lines');
        return [];
    }
    const seen = new Set<number>();
    const lines: InvoiceLine[] = [];
    value.forEach((item: unknown, index: number) => {
        const line = readLine({ item, position: index + 1, seen, problems });
        if (line !== null) {
            lines.push(line);
        }
    });
    return lines.sort((a, b) => a.lineNumber - b.lineNumber);
}

function readLine({ item, position, seen, problems }: ReadLineParams): InvoiceLine | null {
    if (typeof item !== 'object' || item === null) {
        problems.push(`Item ${position} is empty`);
        return null;
    }
    const problemsBefore = problems.length;
    const lineNumber = readLineNumber({ value: fieldOf({ item, key: 'lineNumber' }), position, problems });
    const label = lineNumber === null ? `Item ${position}` : `Line ${lineNumber}`;
    if (lineNumber !== null && seen.has(lineNumber)) {
        problems.push(`${label} appears twice`);
    }
    if (lineNumber !== null) {
        seen.add(lineNumber);
    }
    const quantity = numberField({ value: fieldOf({ item, key: 'quantity' }), label: `${label}: Quantity`, problems });
    if (quantity !== null && quantity <= 0) {
        problems.push(`${label}: quantity must be more than 0`);
    }
    const exclVatCents = centsField({ value: fieldOf({ item, key: 'lineTotalExclVat' }), label: `${label}: Line Total Excl. VAT`, problems });
    const inclVatCents = centsField({ value: fieldOf({ item, key: 'lineTotalInclVat' }), label: `${label}: Line Total Incl. VAT`, problems });
    checkLineVat({ label, exclVatCents, inclVatCents, problems });
    const description = requiredText({ value: fieldOf({ item, key: 'description' }), label: `${label}: Description`, problems });
    const gtin = readGtin({ value: fieldOf({ item, key: 'gtin' }), label, problems });
    if (problems.length > problemsBefore || lineNumber === null || quantity === null || exclVatCents === null || inclVatCents === null) {
        return null;
    }
    return { lineNumber, quantity, exclVatCents, inclVatCents, vatCents: inclVatCents - exclVatCents, description, gtin };
}

function readLineNumber({ value, position, problems }: { value: unknown; position: number; problems: string[] }): number | null {
    const read = readNumber(value);
    if (read.kind === 'missing') {
        problems.push(`Item ${position}: Line Number is required`);
        return null;
    }
    if (read.kind === 'invalid' || !Number.isInteger(read.value) || read.value <= 0) {
        problems.push(`Item ${position}: Line Number must be a whole number above 0`);
        return null;
    }
    return read.value;
}

function checkLineVat({ label, exclVatCents, inclVatCents, problems }: LineVatParams): void {
    if (exclVatCents === null || inclVatCents === null) {
        return;
    }
    if (exclVatCents < 0) {
        problems.push(`${label}: Line Total Excl. VAT can't be negative`);
        return;
    }
    if (inclVatCents < exclVatCents) {
        problems.push(`${label}: Line Total Incl. VAT is less than excl.`);
        return;
    }
    const vatCents = inclVatCents - exclVatCents;
    // Every line goes to Shoprite as STANDARD 15%; a cent either way allows for the line's own rounding.
    if (Math.abs(vatCents * 100 - exclVatCents * VAT_PERCENT) > 100) {
        problems.push(`${label}: VAT ${money(vatCents)} is not 15% of ${money(exclVatCents)}`);
    }
}

function readGtin({ value, label, problems }: { value: unknown; label: string; problems: string[] }): string {
    const text = requiredText({ value, label: `${label}: GTIN`, problems });
    if (text === '') {
        return text;
    }
    if (!/^\d{13,14}$/.test(text)) {
        problems.push(`${label}: GTIN must be 13 or 14 digits: ${text}`);
        return text;
    }
    // A 13-digit EAN is the same item as the GTIN-14 with a leading zero, and the check digit doesn't change.
    const gtin = text.padStart(14, '0');
    if (!hasValidCheckDigit(gtin)) {
        problems.push(`${label}: GTIN ${gtin} has a wrong check digit`);
    }
    return gtin;
}

function compareTotals({ totals, lines, problems }: { totals: InvoiceTotals; lines: InvoiceLine[]; problems: string[] }): void {
    const sums: InvoiceTotals = {
        exclVatCents: lines.reduce((sum, line) => sum + line.exclVatCents, 0),
        vatCents: lines.reduce((sum, line) => sum + line.vatCents, 0),
        inclVatCents: lines.reduce((sum, line) => sum + line.inclVatCents, 0),
    };
    for (const [key, label] of TOTAL_LABELS) {
        if (Math.abs(totals[key] - sums[key]) > 1) {
            problems.push(`${label} ${money(totals[key])} does not match the lines (${money(sums[key])})`);
        }
    }
}

function numberField({ value, label, problems }: FieldParams): number | null {
    const read = readNumber(value);
    if (read.kind === 'missing') {
        problems.push(`${label} is required`);
        return null;
    }
    if (read.kind === 'invalid') {
        problems.push(`${label} must be a number`);
        return null;
    }
    return read.value;
}

function centsField(params: FieldParams): number | null {
    const value = numberField(params);
    return value === null ? null : Math.round(value * 100);
}

function readNumber(value: unknown): NumberRead {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return { kind: 'missing' };
    }
    let parsed = Number.NaN;
    if (typeof value === 'number') {
        parsed = value;
    } else if (typeof value === 'string') {
        parsed = Number(value.trim());
    }
    return Number.isFinite(parsed) ? { kind: 'ok', value: parsed } : { kind: 'invalid' };
}

function cleanText(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    return withoutControlCharacters(String(value)).trim();
}

// XML 1.0 can't carry most control characters, and Shoprite rejects a message it can't parse without saying which field broke it.
function withoutControlCharacters(text: string): string {
    return [...text]
        .filter((char) => {
            const code = char.charCodeAt(0);
            return code === TAB || (code >= 32 && code !== DELETE);
        })
        .join('');
}

function isRealDate(text: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match === null) {
        return false;
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toISOString().slice(0, 10) === text;
}

function hasValidCheckDigit(digits: string): boolean {
    const body = digits.slice(0, -1).split('').reverse();
    const sum = body.reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(digits.slice(-1));
}

function fieldOf({ item, key }: { item: object; key: string }): unknown {
    return Object.entries(item).find(([name]) => name === key)?.[1];
}

function money(cents: number): string {
    return (cents / 100).toFixed(2);
}

const VAT_PERCENT = 15;
const TAB = 9;
const DELETE = 127;
const TOTAL_LABELS: [keyof InvoiceTotals, string][] = [
    ['exclVatCents', 'Total Excl. VAT'],
    ['vatCents', 'Total VAT'],
    ['inclVatCents', 'Total Incl. VAT'],
];

export const gs1Invoice = { check, isGln };

type FieldParams = { value: unknown; label: string; problems: string[] };
type NumberRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; value: number };
type ReadLineParams = { item: unknown; position: number; seen: Set<number>; problems: string[] };
type LineVatParams = { label: string; exclVatCents: number | null; inclVatCents: number | null; problems: string[] };

export type InvoiceInput = {
    invoiceNumber?: unknown;
    invoiceDate?: unknown;
    purchaseOrder?: unknown;
    storeGln?: unknown;
    totalExclVat?: unknown;
    totalVat?: unknown;
    totalInclVat?: unknown;
    lines?: unknown;
};
export type InvoiceTotals = { exclVatCents: number; vatCents: number; inclVatCents: number };
export type InvoiceLine = {
    lineNumber: number;
    quantity: number;
    exclVatCents: number;
    inclVatCents: number;
    vatCents: number;
    description: string;
    gtin: string;
};
export type Invoice = {
    invoiceNumber: string;
    invoiceDate: string;
    purchaseOrder: string;
    storeGln: string;
    totals: InvoiceTotals;
    lines: InvoiceLine[];
};
