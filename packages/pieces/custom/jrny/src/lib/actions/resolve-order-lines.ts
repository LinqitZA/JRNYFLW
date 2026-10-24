import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { jrnyAuth, JrnyAuth } from '../auth';
import { JrnyApiError, jrnyClient } from '../client';

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
        quantity: Property.Number({ displayName: 'Quantity', description: 'A line without a quantity is left out.', required: false }),
        unitPrice: Property.Number({ displayName: 'Unit Price (excl. VAT)', required: false }),
        description: Property.ShortText({ displayName: 'Description', required: false }),
        reference: Property.ShortText({ displayName: 'Reference', description: 'e.g. the order line number', required: false }),
      },
    }),
    warnings: Property.Array({
      displayName: 'Warnings',
      description: 'Problems found on the incoming order, e.g. {{step_3.item.warnings}}. Each goes on the notes and keeps the order as a draft.',
      required: false,
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
        const warnings = textsOf(p.warnings);
        return {
          addressCode,
          addressFallback,
          lines,
          lineCount: lines.length,
          dropped,
          clean: !addressFallback && dropped.length === 0 && warnings.length === 0,
          notes: notesFor({ prefix: (p.notePrefix ?? '').trim(), wanted, addressCode, addressFallback, dropped, warnings }),
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
  let found = line.stockCode === null ? null : await lookup({ kind: 'stockCode', value: line.stockCode });
  if (found === null && line.barcode !== null) {
    matchedBy = 'barcode';
    found = await lookup({ kind: 'barcode', value: line.barcode });
  }
  if (found === null) {
    return drop('item not found');
  }
  if ('refused' in found) {
    return drop(found.refused);
  }
  if (!found.isActive) {
    return drop('inactive in JRNY');
  }
  // unitPrice and uom stay as null rather than absent: the builder's list mapper skips items missing a key, which would misalign the lines.
  return { stockCode: found.stockCode, qty: line.quantity, unitPrice: line.unitPrice, reference, matchedBy, uom: found.uom };
}

function productLookup({ trace, auth, entity }: { trace: Tracer; auth: JrnyAuth; entity: string }): ProductLookup {
  const cache = new Map<string, Promise<LookupResult>>();
  return ({ kind, value }) => {
    const key = `${kind}:${value}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const pending = kind === 'stockCode'
      ? jrnyClient.find<unknown>({ trace, auth, path: `${entity}/products/${encodeURIComponent(value)}` }).then((body) => (body === null ? null : productOf(body)))
      : barcodeLookup({ trace, auth, path: `${entity}/products/by-barcode/${encodeURIComponent(value)}` });
    cache.set(key, pending);
    return pending;
  };
}

async function barcodeLookup({ trace, auth, path }: { trace: Tracer; auth: JrnyAuth; path: string }): Promise<LookupResult> {
  try {
    const body = await jrnyClient.find<unknown>({ trace, auth, path });
    return body === null ? null : barcodeMatchOf(body);
  } catch (err) {
    // These refuse one barcode, not the call, so only that line is left out.
    if (err instanceof JrnyApiError && err.httpStatus === 409) {
      return { refused: 'barcode matches more than one JRNY product' };
    }
    if (err instanceof JrnyApiError && err.httpStatus === 410) {
      return { refused: 'barcode deactivated in JRNY' };
    }
    if (err instanceof JrnyApiError && err.httpStatus === 422) {
      return { refused: `JRNY cannot use this barcode: ${err.jrnyMessage}` };
    }
    throw err;
  }
}

function productOf(body: unknown): Product {
  if (!isRecord(body) || typeof body['stockCode'] !== 'string') {
    throw new Error('Unexpected response from JRNY: a product without a stock code');
  }
  return { stockCode: body['stockCode'], isActive: body['isActive'] !== false, uom: null };
}

// The unit is the one this barcode stands for (each, box, case), so the quote line is counted in what Shoprite ordered.
function barcodeMatchOf(body: unknown): Product {
  const match = isRecord(body) ? body['data'] : undefined;
  if (!isRecord(match) || typeof match['stockCode'] !== 'string') {
    throw new Error('Unexpected response from JRNY: a barcode match without a stock code');
  }
  return { stockCode: match['stockCode'], isActive: true, uom: textOf(match['uom']) };
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

function notesFor({ prefix, wanted, addressCode, addressFallback, dropped, warnings }: { prefix: string; wanted: string; addressCode: string; addressFallback: boolean; dropped: DroppedLine[]; warnings: string[] }): string {
  const notes: string[] = [];
  if (prefix !== '') {
    notes.push(/[.!?]$/.test(prefix) ? prefix : `${prefix}.`);
  }
  for (const warning of warnings) {
    notes.push(`Warning: ${/[.!?]$/.test(warning) ? warning : `${warning}.`}`);
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

function textsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => textOf(item) ?? []) : [];
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
type Product = { stockCode: string; isActive: boolean; uom: string | null };
type LookupResult = Product | { refused: string } | null;
type ProductLookup = (query: { kind: 'stockCode' | 'barcode'; value: string }) => Promise<LookupResult>;
type ResolvedLine = { stockCode: string; qty: number; unitPrice: number | null; reference: string; matchedBy: 'stockCode' | 'barcode'; uom: string | null };
type DroppedLine = { reference: string; description: string | null; stockCode: string | null; barcode: string | null; reason: string };
