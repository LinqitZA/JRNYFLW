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
  // unitPrice stays as null rather than absent: the builder's list mapper skips items missing a key, which would misalign the prices.
  return { stockCode: product.stockCode, qty: line.quantity, unitPrice: line.unitPrice, reference, matchedBy };
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
type ResolvedLine = { stockCode: string; qty: number; unitPrice: number | null; reference: string; matchedBy: 'stockCode' | 'barcode' };
type DroppedLine = { reference: string; description: string | null; stockCode: string | null; barcode: string | null; reason: string };
