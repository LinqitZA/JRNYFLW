# Shoprite Send Invoice (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Shoprite piece can send one JRNY invoice to Shoprite as a GS1 invoice message:
- in exactly the XML layout Shoprite's existing integration uses;
- checked before sending;
- with Shoprite's answer turned into a clear success or failure.

**Architecture:** Two pure modules do the work, and the action wires them to the existing client and trace:
- `gs1-invoice.ts` checks plain inputs, converts amounts to cents and builds the XML;
- `invoice-response.ts` reads Shoprite's confirmation and error bodies.

The connection gains Supplier GLN and VAT Registration Number. Upload Invoice is removed.

**Tech Stack:** TypeScript, Activepieces pieces framework, `@activepieces/pieces-common` httpClient (mocked in tests), `@jrnyflw/piece-trace`, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-10-17-shoprite-invoices-design.md`. This plan covers the spec's Shoprite piece work only: "Piece work: Shoprite Send Invoice". The JRNY actions, the flow, the generator and the orders-flow GTIN change are phase 2, which waits on JRNY's endpoints.

## Global Constraints

- **Never send anything to Shoprite production.** Every test mocks `httpClient.sendRequest`. There are no live calls.
- **Committed fixtures use made-up GLNs, GTINs, prices and descriptions,** with valid GS1 check digits. The user's real sample (production pricing) is used only from the scratchpad, in Task 2's one-off check, and is never committed.
- **The XML layout is copied from the user's 2026-10-17 sample:**
  - real CR LF line breaks;
  - two spaces per indent level, including the sample's quirks (see Task 2's golden string);
  - namespaces verbatim;
  - `<Manifest />` self-closed.
- **GTINs keep their leading zeros.** A 13-digit EAN gets one leading zero to make 14 digits.
- **Money is handled in integer cents** inside the piece and printed with 2 decimals. Quantities are printed with 6 decimals.
- **Repo conventions:**
  - named (destructured) parameters for functions with more than one parameter;
  - util files export one object;
  - exported types and constants at the end of the file;
  - no `any`, no `as` casts, no non-null assertions;
  - comments only to explain why.
- **Secrets never appear in step output.** Tests assert that the Shoprite password and the base64 credentials are absent.
- **No piece version bumps.** Ruling carried from the orders plan: exported flows pin `0.1.0`, and the dev pieces load from dist.
- **Commands** run from `packages/pieces/custom/shoprite`:
  - tests: `bunx vitest run`;
  - type check: `bunx tsc -p tsconfig.lib.json --noEmit`;
  - lint: `bunx eslint 'src/**/*.ts'`.

## Review Focus

1. **Sending between 22:00 and 24:00 UTC.** That is already the next day in South Africa. `creationDateTime` and SBDH `CreationDateAndTime` must use the South African date and time, not UTC's. Pinned in Task 2.
2. **Amounts, quantities and line numbers arriving as text** (`"376.75"`, `"2"`) from a list-mapper expression must parse as numbers, not fail the checks. Pinned in Task 1.
3. **A Shoprite error whose line breaks are real CR LF** rather than literal `\r\n` text must clean up the same way. Pinned in Task 3.
4. **XML special characters in identifiers** (invoice number, PO), not just in descriptions, must be escaped. Pinned in Task 2.
5. **An empty item in the Lines list** (`null`) must give "Item 1 is empty", not crash the check. Pinned in Task 1.

## Rulings made while planning

- **Every invoice input is `required: false`, and the action's own checks report "X is required".** Why: the engine validates required props before the step runs, so a missing value would fail the step outside the action. Its `onFailure: continue` couldn't catch that, and the flow couldn't record why. That is the same lesson as the orders review. Cost if wrong: the builder doesn't mark these fields as required.
- **Amounts and line fields are `Property.Number`.** Non-numeric text there fails the engine's validation before the step runs. JRNY sends numbers, so this is accepted. Cost if wrong: a garbage amount fails the step without a recorded reason.
- **The spec's "`"` in attributes" escaping isn't implemented.** No attribute carries input data: every attribute value is a constant from the sample. Cost if wrong: none until an attribute takes input.
- **All failed checks are reported together, joined with `; `,** so one JRNY failure record lists everything to fix. The spec shows one message per check, and each test with a single failure still matches that exactly.

---

### Task 1: Invoice checks (`gs1Invoice.check`)

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/gs1-invoice.ts`
- Create: `packages/pieces/custom/shoprite/test/fixtures/invoice.ts`
- Create: `packages/pieces/custom/shoprite/test/gs1-invoice-check.test.ts`

**Interfaces:**
- Produces:
  - `gs1Invoice.check(input: InvoiceInput): Invoice`. It throws `Error(problems.join('; '))`.
  - `gs1Invoice.isGln(text: string): boolean`.
  - Exported types:
    - `InvoiceInput` (every field optional `unknown`: `invoiceNumber, invoiceDate, purchaseOrder, storeGln, totalExclVat, totalVat, totalInclVat, lines`);
    - `Invoice { invoiceNumber, invoiceDate, purchaseOrder, storeGln: string; totals: InvoiceTotals; lines: InvoiceLine[] }`;
    - `InvoiceTotals { exclVatCents, vatCents, inclVatCents: number }`;
    - `InvoiceLine { lineNumber, quantity, exclVatCents, inclVatCents, vatCents: number; description, gtin: string }`.
  - Lines come back sorted by `lineNumber`. `gtin` is always 14 digits.
- Fixture exports: `lineOne(overrides?)`, `lineTwo(overrides?)`, `invoiceProps(overrides?)`, `SUPPLIER`, `SENT_AT`.

- [ ] **Step 1: Write the fixture**

`test/fixtures/invoice.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

`test/gs1-invoice-check.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-invoice-check.test.ts`
Expected: FAIL. Vitest can't resolve `../src/lib/gs1-invoice`.

- [ ] **Step 4: Write the implementation**

`src/lib/gs1-invoice.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-invoice-check.test.ts`
Expected: PASS, 25 tests (the `test.each` rows count separately).

- [ ] **Step 6: Type check, lint, commit**

Run: `cd packages/pieces/custom/shoprite && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: no output, exit 0.

```bash
git add packages/pieces/custom/shoprite/src/lib/gs1-invoice.ts packages/pieces/custom/shoprite/test/fixtures/invoice.ts packages/pieces/custom/shoprite/test/gs1-invoice-check.test.ts
git commit -m "feat(shoprite): invoice checks for Send Invoice (GLN/GTIN check digits, 15% VAT, totals)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: GS1 invoice XML and InvoiceRefNo (`gs1Invoice.toXml`, `gs1Invoice.refNo`)

**Files:**
- Modify: `packages/pieces/custom/shoprite/src/lib/gs1-invoice.ts`
- Create: `packages/pieces/custom/shoprite/test/gs1-invoice-xml.test.ts`

**Interfaces:**
- Consumes: `gs1Invoice.check`, `Invoice`, `InvoiceLine` (Task 1); fixtures `invoiceProps`, `lineOne`, `lineTwo`, `SUPPLIER`, `SENT_AT`.
- Produces:
  - `gs1Invoice.toXml({ invoice: Invoice, supplier: Supplier, invoiceRefNo: string, sentAt: Date }): string`;
  - `gs1Invoice.refNo({ supplierGln: string, invoiceNumber: string }): string`, a lower-case UUID v5;
  - exported type `Supplier { gln: string; vatRegistrationNumber: string }`.

- [ ] **Step 1: Write the failing tests**

`test/gs1-invoice-xml.test.ts`. The golden string is the user's sample with every value swapped for the fixture's made-up ones. Its layout must not be "tidied":

```ts
/// <reference types="vitest/globals" />
import { gs1Invoice } from '../src/lib/gs1-invoice';
import { invoiceProps, lineOne, lineTwo, SENT_AT, SUPPLIER } from './fixtures/invoice';

const REF_NO = 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9';

const GOLDEN = [
    '<?xml version="1.0" encoding="utf-8"?><invoiceMessage xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:gs1:ecom:invoice:xsd:3"><StandardBusinessDocumentHeader xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">',
    '  <HeaderVersion>3.2.0</HeaderVersion>',
    '  <Sender>',
    '    <Identifier Authority="SenderEAN">6009876543219</Identifier>',
    '  </Sender>',
    '  <Receiver>',
    '    <Identifier Authority="ReceiverEAN">6001234567899</Identifier>',
    '  </Receiver>',
    '  <DocumentIdentification>',
    '    <Standard>Standard</Standard>',
    '    <TypeVersion>3.2.0</TypeVersion>',
    '    <InstanceIdentifier>INV-1001</InstanceIdentifier>',
    '    <Type>Invoice</Type>',
    '    <MultipleType>false</MultipleType>',
    '    <CreationDateAndTime>2026-10-17T10:15:30+02:00</CreationDateAndTime>',
    '  </DocumentIdentification>',
    '  <Manifest />',
    '</StandardBusinessDocumentHeader>',
    '  <invoice xmlns="">',
    '    <creationDateTime>2026-10-17T00:00:00+02:00</creationDateTime>',
    '    <documentStatusCode>ORIGINAL</documentStatusCode>',
    '    <documentActionCode>ADD</documentActionCode>',
    '    <documentStructureVersion>3.2.0</documentStructureVersion>',
    '    <revisionNumber>1.0</revisionNumber>',
    '    <documentEffectiveDate>',
    '      <date>2026-10-16</date>',
    '    </documentEffectiveDate>',
    '    <avpList>',
    '      <eComStringAttributeValuePairList attributeName="InstanceIdentifier">INV-1001</eComStringAttributeValuePairList>',
    `      <eComStringAttributeValuePairList attributeName="InvoiceRefNo">${REF_NO}</eComStringAttributeValuePairList>`,
    '    </avpList>',
    '    <InvoiceIdentification>',
    '      <entityIdentification>INV-1001</entityIdentification>',
    '      <contentOwner>',
    '        <gln>6009876543219</gln>',
    '      </contentOwner>',
    '    </InvoiceIdentification>',
    '    <invoiceType>INVOICE</invoiceType>',
    '    <invoiceCurrencyCode>ZAR</invoiceCurrencyCode>',
    '    <countryOfSupplyOfGoods>ZA</countryOfSupplyOfGoods>',
    '    <buyer>',
    '      <gln>6001234567899</gln>',
    '    </buyer>',
    '    <seller>',
    '      <gln>6009876543219</gln>',
    '      <organisationDetails>',
    '        <legalRegistration>',
    '          <legalRegistrationNumber>4000000001</legalRegistrationNumber>',
    '        </legalRegistration>',
    '      </organisationDetails>',
    '    </seller>',
    '    <shipTo>',
    '      <gln>6001234567899</gln>',
    '    </shipTo>',
    '    <invoiceTotals>',
    '      <totalInvoiceAmount currencyCode="ZAR">210.10</totalInvoiceAmount>',
    '      <totalInvoiceAmountPayable currencyCode="ZAR">241.62</totalInvoiceAmountPayable>',
    '      <totalVATAmount currencyCode="ZAR">31.52</totalVATAmount>',
    '    </invoiceTotals>',
    '    <purchaseOrder>',
    '      <entityIdentification>1220000001</entityIdentification>',
    '    </purchaseOrder>',
    '    <invoice xmlns="">',
    '      <entityIdentification>INV-1001</entityIdentification>',
    '      <contentOwner>',
    '        <gln>6009876543219</gln>',
    '      </contentOwner>',
    '    </invoice>',
    '    <invoiceLineItem>',
    '      <lineItemNumber>1</lineItemNumber>',
    '      <invoicedQuantity>2.000000</invoicedQuantity>',
    '      <amountExclusiveAllowancesCharges currencyCode="ZAR">200.00</amountExclusiveAllowancesCharges>',
    '      <amountInclusiveAllowancesCharges currencyCode="ZAR">230.00</amountInclusiveAllowancesCharges>',
    '      <note languageCode="EN">Visitor Badges &amp; Lanyards PK50</note>',
    '      <transactionalTradeItem>',
    '        <gtin>06001234000013</gtin>',
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
    '        <dutyFeeTaxAmount currencyCode="ZAR">30.00</dutyFeeTaxAmount>',
    '        <dutyFeeTaxCategoryCode>STANDARD</dutyFeeTaxCategoryCode>',
    '        <dutyFeeTaxPercentage>15.00</dutyFeeTaxPercentage>',
    '        <dutyFeeTaxTypeCode>VAT</dutyFeeTaxTypeCode>',
    '      </invoiceLineTaxInformation>',
    '    </invoiceLineItem>',
    '    <invoiceLineItem>',
    '      <lineItemNumber>2</lineItemNumber>',
    '      <invoicedQuantity>1.500000</invoicedQuantity>',
    '      <amountExclusiveAllowancesCharges currencyCode="ZAR">10.10</amountExclusiveAllowancesCharges>',
    '      <amountInclusiveAllowancesCharges currencyCode="ZAR">11.62</amountInclusiveAllowancesCharges>',
    '      <note languageCode="EN">Seals &lt;red&gt; 100</note>',
    '      <transactionalTradeItem>',
    '        <gtin>06001234000020</gtin>',
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
    '        <dutyFeeTaxAmount currencyCode="ZAR">1.52</dutyFeeTaxAmount>',
    '        <dutyFeeTaxCategoryCode>STANDARD</dutyFeeTaxCategoryCode>',
    '        <dutyFeeTaxPercentage>15.00</dutyFeeTaxPercentage>',
    '        <dutyFeeTaxTypeCode>VAT</dutyFeeTaxTypeCode>',
    '      </invoiceLineTaxInformation>',
    '    </invoiceLineItem>',
    '  </invoice>',
    '</invoiceMessage>',
].join('\r\n');

function build({ overrides = {}, sentAt = SENT_AT }: { overrides?: Record<string, unknown>; sentAt?: Date } = {}): string {
    return gs1Invoice.toXml({ invoice: gs1Invoice.check(invoiceProps(overrides)), supplier: SUPPLIER, invoiceRefNo: REF_NO, sentAt });
}

describe('gs1Invoice.toXml', () => {
    test('builds the invoice message in the exact layout of Shoprite\'s sample', () => {
        expect(build()).toBe(GOLDEN);
    });

    test('uses only CR LF line breaks', () => {
        const xml = build();
        expect(xml.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    test('uses the South African date and time when it is already tomorrow there', () => {
        const xml = build({ sentAt: new Date('2026-10-17T22:30:00Z') });
        expect(xml).toContain('<CreationDateAndTime>2026-10-18T00:30:00+02:00</CreationDateAndTime>');
        expect(xml).toContain('<creationDateTime>2026-10-18T00:00:00+02:00</creationDateTime>');
    });

    test('escapes XML special characters in identifiers as well as descriptions', () => {
        const xml = build({ overrides: { invoiceNumber: 'INV<1>&2', purchaseOrder: 'PO&1' } });
        expect(xml).toContain('<InstanceIdentifier>INV&lt;1&gt;&amp;2</InstanceIdentifier>');
        expect(xml).toContain('<entityIdentification>PO&amp;1</entityIdentification>');
        expect(xml).not.toContain('INV<1>');
    });

    test('writes lines in line-number order', () => {
        const xml = build({ overrides: { lines: [lineTwo(), lineOne()] } });
        expect(xml.indexOf('<lineItemNumber>1</lineItemNumber>')).toBeLessThan(xml.indexOf('<lineItemNumber>2</lineItemNumber>'));
    });
});

describe('gs1Invoice.refNo', () => {
    test('is a name-based UUID of the supplier GLN and invoice number, the same on every resend', () => {
        expect(gs1Invoice.refNo({ supplierGln: '6009876543219', invoiceNumber: 'INV-1001' })).toBe(REF_NO);
        expect(gs1Invoice.refNo({ supplierGln: '6009876543219', invoiceNumber: 'INV-1002' })).toBe('eb2aec19-f81b-5b43-9338-7d7eecb669c1');
    });
});
```

The two `refNo` values were computed with Python's `uuid.uuid5(uuid.NAMESPACE_URL, '<gln>:<invoice number>')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-invoice-xml.test.ts`
Expected: FAIL with `gs1Invoice.toXml is not a function` (and `gs1Invoice.refNo is not a function`).

- [ ] **Step 3: Write the implementation**

In `src/lib/gs1-invoice.ts`:

Add at the top of the file:

```ts
import { createHash } from 'node:crypto';
```

Add after `isGln`:

```ts
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
```

Add to the constants:

```ts
// South Africa has no daylight saving, so a fixed offset is exact all year.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';
const MESSAGE_OPEN = '<invoiceMessage xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:gs1:ecom:invoice:xsd:3">';
const SBDH_OPEN = '<StandardBusinessDocumentHeader xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">';
```

Change the export to:

```ts
export const gs1Invoice = { check, isGln, toXml, refNo };
```

Add to the types:

```ts
type ToXmlParams = { invoice: Invoice; supplier: Supplier; invoiceRefNo: string; sentAt: Date };

export type Supplier = { gln: string; vatRegistrationNumber: string };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/gs1-invoice-xml.test.ts test/gs1-invoice-check.test.ts`
Expected: PASS, 6 XML tests and 25 check tests.

- [ ] **Step 5: One-off check against the user's real sample (not committed)**

The user's sample is saved at `$SCRATCH/shoprite-invoice-sample.xml`, with real CR LF line breaks. `$SCRATCH` is this session's scratchpad: `/tmp/claude-1000/-home-linqadmin-repo-jrnyflw/f4f515ef-e6d9-4b10-a815-831c7052eed4/scratchpad`. If the file is missing, recreate it from the user's 2026-10-17 message: replace each literal `\r\n` with CR LF.

Write `$SCRATCH/check-sample.ts`:

```ts
import { readFileSync } from 'node:fs';
import { gs1Invoice } from '/home/linqadmin/repo/jrnyflw/packages/pieces/custom/shoprite/src/lib/gs1-invoice';

const scratch = '/tmp/claude-1000/-home-linqadmin-repo-jrnyflw/f4f515ef-e6d9-4b10-a815-831c7052eed4/scratchpad';
const sample = readFileSync(`${scratch}/shoprite-invoice-sample.xml`, 'utf8');
const invoice = gs1Invoice.check({
    invoiceNumber: '2283330',
    invoiceDate: '2026-09-29',
    purchaseOrder: '1219489198',
    storeGln: '6001001462709',
    totalExclVat: 376.75,
    totalVat: 56.51,
    totalInclVat: 433.26,
    lines: [{ lineNumber: 1, quantity: 1, lineTotalExclVat: 376.75, lineTotalInclVat: 433.26, description: 'Shoprite Visitor Badges (1-50) SHO001 PK50', gtin: '02200072627770' }],
});
const built = gs1Invoice.toXml({
    invoice,
    supplier: { gln: '6001651203943', vatRegistrationNumber: '4030209045' },
    invoiceRefNo: 'a3653fe8-b82a-4a09-840f-38fa9a69f3f9',
    sentAt: new Date('2026-09-29T08:00:00Z'),
});
// The sample's creationDateTime (the 30th) came from the old system's clock; the spec sets it from the sending date, so it is the one value allowed to differ.
const mask = (xml: string) => xml.replace(/<creationDateTime>[^<]*<\/creationDateTime>/, '<creationDateTime/>');
const [a, b] = [mask(built), mask(sample)];
if (a === b) {
    console.log('MATCH');
} else {
    const at = [...a].findIndex((char, i) => char !== b[i]);
    console.log('DIFFERENT at', at, JSON.stringify(a.slice(at - 80, at + 80)), JSON.stringify(b.slice(at - 80, at + 80)));
}
```

Run: `cd /home/linqadmin/repo/jrnyflw && bunx tsx /tmp/claude-1000/-home-linqadmin-repo-jrnyflw/f4f515ef-e6d9-4b10-a815-831c7052eed4/scratchpad/check-sample.ts`
Expected: `MATCH`. On `DIFFERENT`, the builder's layout is wrong, not the sample: fix `toXml` and the golden string in the same way, then re-run both.

- [ ] **Step 6: Type check, lint, commit**

Run: `cd packages/pieces/custom/shoprite && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: no output, exit 0.

```bash
git add packages/pieces/custom/shoprite/src/lib/gs1-invoice.ts packages/pieces/custom/shoprite/test/gs1-invoice-xml.test.ts
git commit -m "feat(shoprite): GS1 invoice XML in Shoprite's exact layout, stable InvoiceRefNo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reading Shoprite's answer (`invoiceResponse`)

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/invoice-response.ts`
- Create: `packages/pieces/custom/shoprite/test/invoice-response.test.ts`

**Interfaces:**
- Produces:
  - `invoiceResponse.confirmation(body: unknown): string | null`: the confirmation text when it contains "successfully inserted", otherwise `null`;
  - `invoiceResponse.unconfirmed({ status: number, body: unknown }): string`;
  - `invoiceResponse.failure({ status: number, body: unknown }): string`.
  - All messages are one line and at most 1,000 characters.

- [ ] **Step 1: Write the failing tests**

`test/invoice-response.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { invoiceResponse } from '../src/lib/invoice-response';

const MESSAGE = 'Validation Error:  The Invoice Message is empty or not recognized. \\r\\nEnsure you specify the appropriate Media Type (eg. application/json OR application/xml) in the Content-Type header\\r\\nMissing values between tags, eg tag values for a field such as creationDateTime, missing the date value, Invalid:  &lt;creationDateTime&gt;&lt;/creationDateTime&gt;\\r\\n\\r\\n';
const ERROR_BODY = `<Error><Message>${MESSAGE}</Message><ExceptionMessage>The Invoice Message is empty or not recognized.</ExceptionMessage><ExceptionType>System.ComponentModel.DataAnnotations.ValidationException</ExceptionType><StackTrace>   at B2B.GS1.RESTFul.Web.API.Controllers.VendorInvoiceController.Post(InvoiceMessageType invoiceMessageViewModel, String userName, String password)\\r\\n   at lambda_method(Closure , Object , Object[] )</StackTrace></Error>`;
const EXPECTED = 'Validation Error: The Invoice Message is empty or not recognized. Ensure you specify the appropriate Media Type (eg. application/json OR application/xml) in the Content-Type header Missing values between tags, eg tag values for a field such as creationDateTime, missing the date value, Invalid: <creationDateTime></creationDateTime>';

describe('invoiceResponse.confirmation', () => {
    test('returns the text of Shoprite\'s <string> confirmation', () => {
        expect(invoiceResponse.confirmation('<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">1 record was successfully inserted</string>')).toBe('1 record was successfully inserted');
        expect(invoiceResponse.confirmation('<string>1 record was successfully inserted</string>')).toBe('1 record was successfully inserted');
    });

    test('accepts the confirmation as a plain string, as a JSON response would parse', () => {
        expect(invoiceResponse.confirmation('1 record was successfully inserted')).toBe('1 record was successfully inserted');
    });

    test('returns null for anything that does not confirm the insert', () => {
        expect(invoiceResponse.confirmation('<string>0 records inserted</string>')).toBeNull();
        expect(invoiceResponse.confirmation('')).toBeNull();
        expect(invoiceResponse.confirmation(undefined)).toBeNull();
    });
});

describe('invoiceResponse.failure', () => {
    test('keeps only Shoprite\'s Message, decoded and on one line, without the stack trace', () => {
        const message = invoiceResponse.failure({ status: 400, body: ERROR_BODY });
        expect(message).toBe(EXPECTED);
        expect(message).not.toContain('StackTrace');
        expect(message).not.toContain('ValidationException');
    });

    test('cleans real CR LF line breaks the same way as literal \\r\\n text', () => {
        expect(invoiceResponse.failure({ status: 400, body: ERROR_BODY.replace(/\\r\\n/g, '\r\n') })).toBe(EXPECTED);
    });

    test('reads Message from a JSON error body', () => {
        expect(invoiceResponse.failure({ status: 500, body: { Message: 'An error has occurred.', ExceptionMessage: 'Object reference not set' } })).toBe('An error has occurred.');
    });

    test('falls back to the status and body when there is no Message', () => {
        expect(invoiceResponse.failure({ status: 502, body: '<html>Bad Gateway</html>' })).toBe('HTTP 502: <html>Bad Gateway</html>');
        expect(invoiceResponse.failure({ status: 503, body: '' })).toBe('HTTP 503 with no response body');
    });

    test('caps the message at 1,000 characters', () => {
        const message = invoiceResponse.failure({ status: 400, body: `<Error><Message>${'x'.repeat(1500)}</Message></Error>` });
        expect(message).toHaveLength(1000);
        expect(message.endsWith('…')).toBe(true);
    });
});

describe('invoiceResponse.unconfirmed', () => {
    test('asks for a check in Shoprite before resending, with what Shoprite said', () => {
        expect(invoiceResponse.unconfirmed({ status: 200, body: '<string>0 records inserted</string>' })).toBe(
            'Shoprite answered 200 but did not confirm the invoice: <string>0 records inserted</string>. Check in Shoprite before resending.',
        );
        expect(invoiceResponse.unconfirmed({ status: 204, body: '' })).toBe(
            'Shoprite answered 204 but did not confirm the invoice: (empty body). Check in Shoprite before resending.',
        );
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/invoice-response.test.ts`
Expected: FAIL. Vitest can't resolve `../src/lib/invoice-response`.

- [ ] **Step 3: Write the implementation**

`src/lib/invoice-response.ts`:

```ts
function confirmation(body: unknown): string | null {
    const text = bodyText(body);
    if (!CONFIRMATION.test(text)) {
        return null;
    }
    const inner = /<string[^>]*>([\s\S]*?)<\/string>/.exec(text);
    return oneLine(decodeEntities(inner === null ? text : inner[1]));
}

function unconfirmed({ status, body }: ResponseParams): string {
    const text = oneLine(bodyText(body));
    return cap(`Shoprite answered ${status} but did not confirm the invoice: ${text === '' ? '(empty body)' : text}. Check in Shoprite before resending.`);
}

function failure({ status, body }: ResponseParams): string {
    const text = bodyText(body);
    const message = oneLine(decodeEntities(errorMessageOf({ body, text })));
    if (message !== '') {
        return cap(message);
    }
    if (text.trim() === '') {
        return `HTTP ${status} with no response body`;
    }
    return cap(`HTTP ${status}: ${oneLine(text)}`);
}

// Shoprite's .NET errors put the readable part in Message; ExceptionMessage repeats it and the stack trace means nothing to whoever fixes the invoice.
function errorMessageOf({ body, text }: { body: unknown; text: string }): string {
    const xml = /<Message>([\s\S]*?)<\/Message>/.exec(text);
    if (xml !== null) {
        return xml[1];
    }
    if (typeof body === 'object' && body !== null) {
        const field = Object.entries(body).find(([key]) => key === 'Message')?.[1];
        if (typeof field === 'string') {
            return field;
        }
    }
    return '';
}

function bodyText(body: unknown): string {
    if (body === undefined || body === null) {
        return '';
    }
    return typeof body === 'string' ? body : JSON.stringify(body);
}

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

// Shoprite's messages carry line breaks both as real CR LF and as literal "\r\n" text.
function oneLine(text: string): string {
    return text.replace(/\\r\\n|\\r|\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cap(text: string): string {
    return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…` : text;
}

const CONFIRMATION = /successfully inserted/i;
const MAX_MESSAGE_CHARS = 1000;

export const invoiceResponse = { confirmation, unconfirmed, failure };

type ResponseParams = { status: number; body: unknown };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/invoice-response.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type check, lint, commit**

Run: `cd packages/pieces/custom/shoprite && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts'`
Expected: no output, exit 0.

```bash
git add packages/pieces/custom/shoprite/src/lib/invoice-response.ts packages/pieces/custom/shoprite/test/invoice-response.test.ts
git commit -m "feat(shoprite): read Shoprite's invoice confirmation and error messages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Send Invoice action, connection fields, Upload Invoice removed

**Files:**
- Create: `packages/pieces/custom/shoprite/src/lib/actions/send-invoice.ts`
- Create: `packages/pieces/custom/shoprite/test/send-invoice.test.ts`
- Modify: `packages/pieces/custom/shoprite/src/lib/client.ts` (add `send`, returning the full response)
- Modify: `packages/pieces/custom/shoprite/src/lib/auth.ts` (Supplier GLN, VAT Registration Number)
- Modify: `packages/pieces/custom/shoprite/src/index.ts`
- Modify: `packages/pieces/custom/shoprite/test/trace.test.ts` (rewritten on Send Invoice)
- Delete: `packages/pieces/custom/shoprite/src/lib/actions/upload-invoice.ts`, `packages/pieces/custom/shoprite/test/upload-invoice.test.ts`

**Interfaces:**
- Consumes:
  - `gs1Invoice.check / isGln / toXml / refNo` and `Supplier` (Tasks 1–2);
  - `invoiceResponse.confirmation / unconfirmed / failure` (Task 3);
  - `shopriteClient.secretsOf`, `pieceTrace.run`, `pieceTrace.onFailureProperty`.
- Produces:
  - action `send_invoice`;
  - `shopriteClient.send<T>(params: CallParams): Promise<HttpResponse<T>>`;
  - `ShopriteAuth` gains `supplierGln?: string; vatRegistrationNumber?: string`.
  - Output on success: `{ invoiceNumber, invoiceRefNo, purchaseOrder, storeGln, lineCount, totalInclVat, shopriteMessage }`.

- [ ] **Step 1: Write the failing tests**

`test/send-invoice.test.ts`:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { sendInvoice } from '../src/lib/actions/send-invoice';
import { shopriteAuth, ShopriteAuth } from '../src/lib/auth';
import { gs1Invoice } from '../src/lib/gs1-invoice';
import { invoiceProps, SENT_AT, SUPPLIER } from './fixtures/invoice';

const PASSWORD = 'shoprite-secret-pass';
const REF_NO = 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9';
const AUTH: ShopriteAuth = {
    baseUrl: 'https://x/b2bservice/',
    username: 'u',
    password: PASSWORD,
    contractId: 'c',
    invoiceEndpoint: 'VendorInvoice',
    supplierGln: SUPPLIER.gln,
    vatRegistrationNumber: SUPPLIER.vatRegistrationNumber,
};
const CONFIRMED = { status: 200, body: '<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">1 record was successfully inserted</string>' };

function run({ propsValue, auth = AUTH }: { propsValue: Record<string, unknown>; auth?: ShopriteAuth }) {
    return sendInvoice.run({ ...createMockActionContext({ propsValue }), auth: { props: auth } });
}

function httpError({ status, data }: { status: number; data: unknown }): HttpError {
    const config = { headers: new AxiosHeaders() };
    return new HttpError({}, new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', headers: {}, config, data }));
}

describe('sendInvoice', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(SENT_AT);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('POSTs the invoice XML to VendorInvoice and returns Shoprite\'s confirmation', async () => {
        sendRequest.mockResolvedValueOnce(CONFIRMED);
        const result = await run({ propsValue: invoiceProps() });
        const request = sendRequest.mock.calls[0][0];
        expect(request).toMatchObject({
            method: 'POST',
            url: 'https://x/b2bservice/api/VendorInvoice',
            headers: expect.objectContaining({ 'Content-Type': 'application/xml', ContractID: 'c', UIUser: 'u' }),
        });
        expect(request.body).toBe(gs1Invoice.toXml({ invoice: gs1Invoice.check(invoiceProps()), supplier: SUPPLIER, invoiceRefNo: REF_NO, sentAt: SENT_AT }));
        expect(result).toMatchObject({
            ok: true,
            output: {
                invoiceNumber: 'INV-1001',
                invoiceRefNo: REF_NO,
                purchaseOrder: '1220000001',
                storeGln: '6001234567899',
                lineCount: 2,
                totalInclVat: 241.62,
                shopriteMessage: '1 record was successfully inserted',
            },
        });
        expect(JSON.stringify(result)).not.toContain(PASSWORD);
    });

    test('posts to B2BInvoice when the connection says so', async () => {
        sendRequest.mockResolvedValueOnce(CONFIRMED);
        await run({ propsValue: invoiceProps(), auth: { ...AUTH, invoiceEndpoint: 'B2BInvoice' } });
        expect(sendRequest.mock.calls[0][0].url).toBe('https://x/b2bservice/api/B2BInvoice');
    });

    test('accepts a 201 confirmation', async () => {
        sendRequest.mockResolvedValueOnce({ ...CONFIRMED, status: 201 });
        const result = await run({ propsValue: invoiceProps() });
        expect(result).toMatchObject({ ok: true });
    });

    test('refuses an invoice that fails the checks, without calling Shoprite', async () => {
        const result = await run({ propsValue: { ...invoiceProps({ purchaseOrder: '' }), onFailure: 'continue' } });
        expect(result).toMatchObject({ ok: false, error: { message: 'Purchase Order is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('needs a valid Supplier GLN and a VAT Registration Number on the connection', async () => {
        const propsValue = { ...invoiceProps(), onFailure: 'continue' };
        expect(await run({ propsValue, auth: { ...AUTH, supplierGln: undefined } })).toMatchObject({
            ok: false,
            error: { message: 'Add the Supplier GLN to the Shoprite connection' },
        });
        expect(await run({ propsValue, auth: { ...AUTH, supplierGln: '6009876543210' } })).toMatchObject({
            ok: false,
            error: { message: 'The Supplier GLN on the Shoprite connection (6009876543210) must be 13 digits with a valid check digit' },
        });
        expect(await run({ propsValue, auth: { ...AUTH, vatRegistrationNumber: '  ' } })).toMatchObject({
            ok: false,
            error: { message: 'Add the VAT Registration Number to the Shoprite connection' },
        });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('returns Shoprite\'s error message without the stack trace', async () => {
        sendRequest.mockRejectedValueOnce(httpError({
            status: 400,
            data: '<Error><Message>Validation Error:  The Invoice Message is empty or not recognized.</Message><StackTrace>   at B2B.GS1</StackTrace></Error>',
        }));
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'Validation Error: The Invoice Message is empty or not recognized.', status: 400 },
        });
        expect(result.sent[0].status).toBe(400);
    });

    test('treats a 200 without the confirmation as a failure to check in Shoprite', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: '<string>0 records inserted</string>' });
        const result = await run({ propsValue: { ...invoiceProps(), onFailure: 'continue' } });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'Shoprite answered 200 but did not confirm the invoice: <string>0 records inserted</string>. Check in Shoprite before resending.' },
        });
    });

    test('stops the run by default when Shoprite rejects the invoice', async () => {
        sendRequest.mockRejectedValueOnce(httpError({ status: 400, data: '<Error><Message>Validation Error: bad</Message></Error>' }));
        await expect(run({ propsValue: invoiceProps() })).rejects.toThrow('Validation Error: bad');
    });
});

describe('Shoprite connection', () => {
    test('offers Supplier GLN and VAT Registration Number as optional fields, so existing connections stay valid', () => {
        expect(shopriteAuth.props.supplierGln).toMatchObject({ displayName: 'Supplier GLN', required: false });
        expect(shopriteAuth.props.vatRegistrationNumber).toMatchObject({ displayName: 'VAT Registration Number', required: false });
    });
});
```

Replace `test/trace.test.ts` entirely:

```ts
/// <reference types="vitest/globals" />
import { vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { sendInvoice } from '../src/lib/actions/send-invoice';
import { ShopriteAuth } from '../src/lib/auth';
import { invoiceProps, SUPPLIER } from './fixtures/invoice';

const PASSWORD = 'Sh0pr1te!pw';
const auth: { props: ShopriteAuth } = {
    props: {
        baseUrl: 'https://x/b2bservice',
        username: 'vendor1',
        password: PASSWORD,
        contractId: 'C-77',
        invoiceEndpoint: 'VendorInvoice',
        supplierGln: SUPPLIER.gln,
        vatRegistrationNumber: SUPPLIER.vatRegistrationNumber,
    },
};

describe('shoprite trace', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('records the invoice POST, redacts both auth headers and keeps ContractID and UIUser', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: '<string>1 record was successfully inserted</string>' });
        const result = await sendInvoice.run({ ...createMockActionContext({ propsValue: invoiceProps() }), auth });
        expect(result.sent[0]).toMatchObject({
            method: 'POST',
            url: 'https://x/b2bservice/api/VendorInvoice',
            headers: { Authorization: '[redacted]', Authentication: '[redacted]', ContractID: 'C-77', UIUser: 'vendor1', 'Content-Type': 'application/xml' },
            status: 200,
        });
        expect(result.sent[0].body).toEqual(expect.stringContaining('<invoiceMessage '));
        const text = JSON.stringify(result);
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain(Buffer.from(`vendor1:${PASSWORD}`).toString('base64'));
    });

    test('continue mode returns a network failure as data', async () => {
        sendRequest.mockRejectedValueOnce(new Error('socket hang up'));
        const result = await sendInvoice.run({ ...createMockActionContext({ propsValue: { ...invoiceProps(), onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({ ok: false, output: null, error: { message: 'socket hang up', status: null } });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/send-invoice.test.ts test/trace.test.ts`
Expected: FAIL. Vitest can't resolve `../src/lib/actions/send-invoice`.

- [ ] **Step 3: Add `send` to the client**

In `src/lib/client.ts`:
- change the import line to `import { HttpMethod, HttpResponse } from '@activepieces/pieces-common';`;
- replace `call` with `send` plus a `call` that uses it;
- update the export.

```ts
async function send<T>({ trace, auth, method, path, body, query, headers }: CallParams): Promise<HttpResponse<T>> {
    return trace.send<T>({
        request: {
            method,
            url: joinUrl(auth.baseUrl, path),
            headers: { ...buildHeaders(auth), ...headers },
            queryParams: query,
            body,
        },
    });
}

async function call<T>(params: CallParams): Promise<T> {
    const response = await send<T>(params);
    return response.body;
}
```

```ts
export const shopriteClient = { buildHeaders, joinUrl, call, send, secretsOf };
```

- [ ] **Step 4: Add the connection fields**

In `src/lib/auth.ts`, add after `contractId` in `props`:

```ts
        supplierGln: Property.ShortText({
            displayName: 'Supplier GLN',
            description: 'Your 13-digit GLN as a Shoprite supplier: the sender on every invoice. Needed for Send Invoice.',
            required: false,
        }),
        vatRegistrationNumber: Property.ShortText({
            displayName: 'VAT Registration Number',
            description: 'Your VAT registration number, as printed on your invoices. Needed for Send Invoice.',
            required: false,
        }),
```

Add to the end of the markdown text (inside the template string):

```
To send invoices, also fill in your **Supplier GLN** and **VAT Registration Number**.
```

Add to `ShopriteAuth`:

```ts
    supplierGln?: string;
    vatRegistrationNumber?: string;
```

- [ ] **Step 5: Write the action**

`src/lib/actions/send-invoice.ts`:

```ts
import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpError, HttpMethod } from '@activepieces/pieces-common';
import { tryCatch } from '@activepieces/shared';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { shopriteAuth, ShopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { gs1Invoice, Supplier } from '../gs1-invoice';
import { invoiceResponse } from '../invoice-response';

export const sendInvoice = createAction({
    auth: shopriteAuth,
    name: 'send_invoice',
    displayName: 'Send Invoice',
    description:
        'Sends one invoice to Shoprite as a GS1 invoice message (XML). Checks the invoice first and fails with the reason if anything is missing or does not add up. In a flow, set "If the call fails" to Continue and record the result back in JRNY.',
    // Optional in the builder so the action's own checks name what is missing: the engine rejects a blank required field before the step runs, where Continue can't catch it.
    props: {
        invoiceNumber: Property.ShortText({ displayName: 'Invoice Number', description: 'The JRNY invoice number. Required.', required: false }),
        invoiceDate: Property.ShortText({ displayName: 'Invoice Date', description: 'YYYY-MM-DD. Required.', required: false }),
        purchaseOrder: Property.ShortText({
            displayName: 'Purchase Order',
            description: "Shoprite's order number (the invoice's customer PO number). Required.",
            required: false,
        }),
        storeGln: Property.ShortText({
            displayName: 'Store GLN',
            description: 'The 13-digit GLN of the Shoprite store being invoiced: the buyer, ship-to and receiver. Required.',
            required: false,
        }),
        totalExclVat: Property.Number({ displayName: 'Total Excl. VAT', description: 'Required.', required: false }),
        totalVat: Property.Number({ displayName: 'Total VAT', description: 'Required.', required: false }),
        totalInclVat: Property.Number({ displayName: 'Total Incl. VAT', description: 'Required. Must match the lines to within a cent.', required: false }),
        lines: Property.Array({
            displayName: 'Lines',
            description: 'One entry per invoice line. Line VAT is worked out as incl. minus excl. and must be 15% of excl.',
            required: false,
            properties: {
                lineNumber: Property.Number({ displayName: 'Line Number', required: false }),
                quantity: Property.Number({ displayName: 'Quantity', required: false }),
                lineTotalExclVat: Property.Number({ displayName: 'Line Total Excl. VAT', required: false }),
                lineTotalInclVat: Property.Number({ displayName: 'Line Total Incl. VAT', required: false }),
                description: Property.ShortText({ displayName: 'Description', required: false }),
                gtin: Property.ShortText({
                    displayName: 'GTIN',
                    description: "Shoprite's 13- or 14-digit barcode for the item. Keep the leading zeros.",
                    required: false,
                }),
            },
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const props = context.propsValue;
        return pieceTrace.run({
            onFailure: props.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: async (trace) => {
                const supplier = supplierOf(auth);
                const invoice = gs1Invoice.check({
                    invoiceNumber: props.invoiceNumber,
                    invoiceDate: props.invoiceDate,
                    purchaseOrder: props.purchaseOrder,
                    storeGln: props.storeGln,
                    totalExclVat: props.totalExclVat,
                    totalVat: props.totalVat,
                    totalInclVat: props.totalInclVat,
                    lines: props.lines,
                });
                const invoiceRefNo = gs1Invoice.refNo({ supplierGln: supplier.gln, invoiceNumber: invoice.invoiceNumber });
                const xml = gs1Invoice.toXml({ invoice, supplier, invoiceRefNo, sentAt: new Date() });
                const shopriteMessage = await post({ trace, auth, xml });
                return {
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceRefNo,
                    purchaseOrder: invoice.purchaseOrder,
                    storeGln: invoice.storeGln,
                    lineCount: invoice.lines.length,
                    totalInclVat: invoice.totals.inclVatCents / 100,
                    shopriteMessage,
                };
            },
        });
    },
});

async function post({ trace, auth, xml }: { trace: Tracer; auth: ShopriteAuth; xml: string }): Promise<string> {
    const { data: response, error } = await tryCatch(() =>
        shopriteClient.send<unknown>({
            trace,
            auth,
            method: HttpMethod.POST,
            path: `/api/${auth.invoiceEndpoint ?? 'VendorInvoice'}`,
            headers: { 'Content-Type': 'application/xml' },
            body: xml,
        }),
    );
    if (error !== null) {
        if (error instanceof HttpError) {
            throw new Error(invoiceResponse.failure({ status: error.response.status, body: error.response.body }));
        }
        throw error;
    }
    const message = invoiceResponse.confirmation(response.body);
    if (message === null) {
        throw new Error(invoiceResponse.unconfirmed({ status: response.status, body: response.body }));
    }
    return message;
}

function supplierOf(auth: ShopriteAuth): Supplier {
    const gln = (auth.supplierGln ?? '').trim();
    const vatRegistrationNumber = (auth.vatRegistrationNumber ?? '').trim();
    if (gln === '') {
        throw new Error('Add the Supplier GLN to the Shoprite connection');
    }
    if (!gs1Invoice.isGln(gln)) {
        throw new Error(`The Supplier GLN on the Shoprite connection (${gln}) must be 13 digits with a valid check digit`);
    }
    if (vatRegistrationNumber === '') {
        throw new Error('Add the VAT Registration Number to the Shoprite connection');
    }
    return { gln, vatRegistrationNumber };
}
```

- [ ] **Step 6: Swap the action into the piece and remove Upload Invoice**

`src/index.ts`:
- replace `import { uploadInvoice } from './lib/actions/upload-invoice';` with `import { sendInvoice } from './lib/actions/send-invoice';`;
- set `actions: [downloadOrders, acknowledgeOrders, sendInvoice, customApiCall]`;
- set `description: 'Shoprite B2B Supplier Services (GS1 eCom): download and acknowledge orders, send invoices.'`.

```bash
git rm packages/pieces/custom/shoprite/src/lib/actions/upload-invoice.ts packages/pieces/custom/shoprite/test/upload-invoice.test.ts
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run test/send-invoice.test.ts test/trace.test.ts`
Expected: PASS, 9 send-invoice tests and 2 trace tests.

- [ ] **Step 8: Whole piece: tests, type check, lint, build**

Run: `cd packages/pieces/custom/shoprite && bunx vitest run && bunx tsc -p tsconfig.lib.json --noEmit && bunx eslint 'src/**/*.ts' && bun run build`
Expected:
- all test files pass: 28 existing (29 today minus the removed Upload Invoice test) + 25 + 6 + 9 + 9 new = 77;
- tsc and eslint print nothing;
- the build writes `dist/`.

The UAT image picks the new action up from `dist`.

Run: `cd /home/linqadmin/repo/jrnyflw && grep -rn "upload_invoice\|uploadInvoice" packages/pieces/custom/shoprite/src packages/pieces/custom/shoprite/test docs/integrations`
Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add packages/pieces/custom/shoprite
git commit -m "feat(shoprite): Send Invoice posts GS1 invoice XML to Shoprite; Supplier GLN and VAT number on the connection; Upload Invoice removed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
