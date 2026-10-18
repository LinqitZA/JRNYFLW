import { createHash } from 'node:crypto';

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
        throw new Error(summarise(problems));
    }
    return { invoiceNumber, invoiceDate, purchaseOrder, storeGln, totals, lines };
}

function isGln(text: string): boolean {
    return /^\d{13}$/.test(text) && hasValidCheckDigit(text);
}

function toXml({ invoice, supplier, invoiceRefNo, sentAt }: ToXmlParams): string {
    const sast = new Date(sentAt.getTime() + SAST_OFFSET_MS).toISOString();
    const sentTime = `${sast.slice(0, 19)}+02:00`;
    const sentDay = `${sast.slice(0, 10)}T00:00:00+02:00`;
    const number = xmlText(invoice.invoiceNumber);
    const store = xmlText(invoice.storeGln);
    const seller = xmlText(supplier.gln);
    return [
        `${XML_DECLARATION}${MESSAGE_OPEN}${SBDH_OPEN}`,
        '  <HeaderVersion>3.2.0</HeaderVersion>',
        '  <Sender>',
        `    <Identifier Authority="SenderEAN">${seller}</Identifier>`,
        '  </Sender>',
        '  <Receiver>',
        `    <Identifier Authority="ReceiverEAN">${store}</Identifier>`,
        '  </Receiver>',
        '  <DocumentIdentification>',
        '    <Standard>Standard</Standard>',
        '    <TypeVersion>3.2.0</TypeVersion>',
        `    <InstanceIdentifier>${number}</InstanceIdentifier>`,
        '    <Type>Invoice</Type>',
        '    <MultipleType>false</MultipleType>',
        `    <CreationDateAndTime>${sentTime}</CreationDateAndTime>`,
        '  </DocumentIdentification>',
        '  <Manifest />',
        '</StandardBusinessDocumentHeader>',
        '  <invoice xmlns="">',
        `    <creationDateTime>${sentDay}</creationDateTime>`,
        '    <documentStatusCode>ORIGINAL</documentStatusCode>',
        '    <documentActionCode>ADD</documentActionCode>',
        '    <documentStructureVersion>3.2.0</documentStructureVersion>',
        '    <revisionNumber>1.0</revisionNumber>',
        '    <documentEffectiveDate>',
        `      <date>${xmlText(invoice.invoiceDate)}</date>`,
        '    </documentEffectiveDate>',
        '    <avpList>',
        `      <eComStringAttributeValuePairList attributeName="InstanceIdentifier">${number}</eComStringAttributeValuePairList>`,
        `      <eComStringAttributeValuePairList attributeName="InvoiceRefNo">${xmlText(invoiceRefNo)}</eComStringAttributeValuePairList>`,
        '    </avpList>',
        '    <InvoiceIdentification>',
        `      <entityIdentification>${number}</entityIdentification>`,
        '      <contentOwner>',
        `        <gln>${seller}</gln>`,
        '      </contentOwner>',
        '    </InvoiceIdentification>',
        '    <invoiceType>INVOICE</invoiceType>',
        '    <invoiceCurrencyCode>ZAR</invoiceCurrencyCode>',
        '    <countryOfSupplyOfGoods>ZA</countryOfSupplyOfGoods>',
        '    <buyer>',
        `      <gln>${store}</gln>`,
        '    </buyer>',
        '    <seller>',
        `      <gln>${seller}</gln>`,
        '      <organisationDetails>',
        '        <legalRegistration>',
        `          <legalRegistrationNumber>${xmlText(supplier.vatRegistrationNumber)}</legalRegistrationNumber>`,
        '        </legalRegistration>',
        '      </organisationDetails>',
        '    </seller>',
        '    <shipTo>',
        `      <gln>${store}</gln>`,
        '    </shipTo>',
        '    <invoiceTotals>',
        `      <totalInvoiceAmount currencyCode="ZAR">${money(invoice.totals.exclVatCents)}</totalInvoiceAmount>`,
        `      <totalInvoiceAmountPayable currencyCode="ZAR">${money(invoice.totals.inclVatCents)}</totalInvoiceAmountPayable>`,
        `      <totalVATAmount currencyCode="ZAR">${money(invoice.totals.vatCents)}</totalVATAmount>`,
        '    </invoiceTotals>',
        '    <purchaseOrder>',
        `      <entityIdentification>${xmlText(invoice.purchaseOrder)}</entityIdentification>`,
        '    </purchaseOrder>',
        '    <invoice xmlns="">',
        `      <entityIdentification>${number}</entityIdentification>`,
        '      <contentOwner>',
        `        <gln>${seller}</gln>`,
        '      </contentOwner>',
        '    </invoice>',
        ...invoice.lines.flatMap(lineItem),
        '  </invoice>',
        '</invoiceMessage>',
    ].join('\r\n');
}

// Name-based (UUID v5), so a resend of the same invoice carries the same reference instead of looking like a new invoice.
function refNo({ supplierGln, invoiceNumber }: { supplierGln: string; invoiceNumber: string }): string {
    const bytes = createHash('sha1')
        .update(Buffer.from(URL_NAMESPACE.replace(/-/g, ''), 'hex'))
        .update(`${supplierGln}:${invoiceNumber}`)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function lineItem(line: InvoiceLine): string[] {
    return [
        '    <invoiceLineItem>',
        `      <lineItemNumber>${line.lineNumber}</lineItemNumber>`,
        `      <invoicedQuantity>${line.quantity.toFixed(6)}</invoicedQuantity>`,
        `      <amountExclusiveAllowancesCharges currencyCode="ZAR">${money(line.exclVatCents)}</amountExclusiveAllowancesCharges>`,
        `      <amountInclusiveAllowancesCharges currencyCode="ZAR">${money(line.inclVatCents)}</amountInclusiveAllowancesCharges>`,
        `      <note languageCode="EN">${xmlText(line.description)}</note>`,
        '      <transactionalTradeItem>',
        `        <gtin>${line.gtin}</gtin>`,
        '        <transactionalItemData>',
        '          <transactionalItemWeight>',
        '            <measurementValue measurementUnitCode="EA">0</measurementValue>',
        '          </transactionalItemWeight>',
        '        </transactionalItemData>',
        '        <size>',
        '          <sizeCode>1</sizeCode>',
        '        </size>',
        '      </transactionalTradeItem>',
        '      <invoiceLineTaxInformation>',
        `        <dutyFeeTaxAmount currencyCode="ZAR">${money(line.vatCents)}</dutyFeeTaxAmount>`,
        '        <dutyFeeTaxCategoryCode>STANDARD</dutyFeeTaxCategoryCode>',
        '        <dutyFeeTaxPercentage>15.00</dutyFeeTaxPercentage>',
        '        <dutyFeeTaxTypeCode>VAT</dutyFeeTaxTypeCode>',
        '      </invoiceLineTaxInformation>',
        '    </invoiceLineItem>',
    ];
}

function xmlText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// JRNY keeps at most 2,000 characters of a failure message; a field missing on every line of a long invoice would exceed it.
function summarise(problems: string[]): string {
    const shown = [problems[0].slice(0, MAX_MESSAGE_CHARS - MORE_ROOM)];
    for (const problem of problems.slice(1)) {
        if ([...shown, problem].join('; ').length > MAX_MESSAGE_CHARS - MORE_ROOM) {
            break;
        }
        shown.push(problem);
    }
    const hidden = problems.length - shown.length;
    return hidden === 0 ? shown.join('; ') : `${shown.join('; ')}; and ${hidden} more`;
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
const MAX_MESSAGE_CHARS = 1000;
const MORE_ROOM = 20;
const TAB = 9;
const DELETE = 127;
const TOTAL_LABELS: [keyof InvoiceTotals, string][] = [
    ['exclVatCents', 'Total Excl. VAT'],
    ['vatCents', 'Total VAT'],
    ['inclVatCents', 'Total Incl. VAT'],
];

// South Africa has no daylight saving, so a fixed offset is exact all year.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';
const MESSAGE_OPEN = '<invoiceMessage xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:gs1:ecom:invoice:xsd:3">';
const SBDH_OPEN = '<StandardBusinessDocumentHeader xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">';

export const gs1Invoice = { check, isGln, toXml, refNo };

type FieldParams = { value: unknown; label: string; problems: string[] };
type NumberRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; value: number };
type ReadLineParams = { item: unknown; position: number; seen: Set<number>; problems: string[] };
type LineVatParams = { label: string; exclVatCents: number | null; inclVatCents: number | null; problems: string[] };
type ToXmlParams = { invoice: Invoice; supplier: Supplier; invoiceRefNo: string; sentAt: Date };

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
export type Supplier = { gln: string; vatRegistrationNumber: string };
