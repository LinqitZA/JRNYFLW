import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const createQuote = createAction({
  auth: jrnyAuth,
  name: 'create_quote',
  displayName: 'Create Quote',
  description:
    'Create a JRNY quotation in the entity bound to this connection. Resolves customer code, stock codes, pricing, tax, and UOM through the live JRNY services.',
  props: {
    customerCode: Property.ShortText({
      displayName: 'Customer Code',
      description: 'JRNY customer code (e.g. ACME001). Resolved server-side; must exist and be active in the bound entity.',
      required: true,
    }),
    lines: Property.Array({
      displayName: 'Lines',
      description:
        'Quotation line items. Provide stockCode and qty per line. unitPrice is optional — leave blank to let the JRNY pricing engine resolve. uom is optional — defaults to the product stocking UOM.',
      required: true,
      properties: {
        stockCode: Property.ShortText({
          displayName: 'Stock Code',
          required: true,
        }),
        qty: Property.Number({
          displayName: 'Quantity',
          required: true,
        }),
        unitPrice: Property.Number({
          displayName: 'Unit Price (override)',
          description:
            'Leave blank to let the JRNY pricing engine resolve. If supplied, the line is flagged as a price override and the engine-resolved price is recorded as the original.',
          required: false,
        }),
        uom: Property.ShortText({
          displayName: 'UOM Code (optional)',
          description: 'UOM code, e.g. EA, BOX, KG. Omit to use the product stocking UOM.',
          required: false,
        }),
      },
    }),
    notes: Property.LongText({
      displayName: 'Notes',
      required: false,
    }),
    externalReference: Property.ShortText({
      displayName: 'External Reference',
      description: 'Free-text reference recorded on the quotation. Useful for idempotency and audit.',
      required: false,
    }),
    deliveryAddressMode: Property.StaticDropdown<'none' | 'byCode' | 'inline'>({
      displayName: 'Delivery Address',
      required: true,
      defaultValue: 'none',
      options: {
        options: [
          { label: 'Use customer default', value: 'none' },
          { label: 'Reference by customer address code', value: 'byCode' },
          { label: 'Inline custom address', value: 'inline' },
        ],
      },
    }),
    deliveryAddressCode: Property.ShortText({
      displayName: 'Delivery Address Code',
      description: 'Customer address code (e.g. DEL-JOBURG-01). Required when mode is "byCode".',
      required: false,
    }),
    deliveryAddressLine1: Property.ShortText({
      displayName: 'Address Line 1',
      required: false,
    }),
    deliveryAddressLine2: Property.ShortText({
      displayName: 'Address Line 2',
      required: false,
    }),
    deliveryCity: Property.ShortText({
      displayName: 'City',
      required: false,
    }),
    deliveryProvince: Property.ShortText({
      displayName: 'Province / State',
      required: false,
    }),
    deliveryPostalCode: Property.ShortText({
      displayName: 'Postal Code',
      required: false,
    }),
    deliveryCountry: Property.ShortText({
      displayName: 'Country',
      required: false,
    }),
    deliveryContactName: Property.ShortText({
      displayName: 'Contact Name',
      required: false,
    }),
    deliveryContactPhone: Property.ShortText({
      displayName: 'Contact Phone',
      required: false,
    }),
    autoConvert: Property.Checkbox({
      displayName: 'Auto-convert to Sales Order',
      description:
        'When enabled, JRNY will create the quotation, then immediately convert it to a draft sales order. The sales order is returned in the response under `salesOrder`. Credit checks fire on SO confirmation, not on draft creation.',
      required: false,
      defaultValue: false,
    }),
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
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
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
        const lines = (p.lines ?? []) as Array<{
          stockCode: string;
          qty: number;
          unitPrice?: number;
          uom?: string;
        }>;

        const body: Record<string, unknown> = {
          customer: { code: p.customerCode },
          lines: lines.map((l) => ({
            stockCode: l.stockCode,
            qty: l.qty,
            ...(l.unitPrice !== undefined && l.unitPrice !== null ? { unitPrice: l.unitPrice } : {}),
            ...(l.uom ? { uom: l.uom } : {}),
          })),
        };

        if (p.notes) body['notes'] = p.notes;
        if (p.externalReference) body['externalReference'] = p.externalReference;
        if (autoConvert) body['autoConvert'] = true;
        if (autoConfirm) body['autoConfirm'] = true;
        if (deliveryDate !== '') body['deliveryDate'] = deliveryDate;

        const deliveryAddress = buildDeliveryAddress(p);
        if (deliveryAddress) body['deliveryAddress'] = deliveryAddress;

        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/quotations`;
        const idempotencyKey = (p.idempotencyKey ?? '').trim();
        const headers = idempotencyKey === '' ? undefined : { 'Idempotency-Key': idempotencyKey };
        return jrnyClient.callJrny({ trace, auth, method: HttpMethod.POST, path, body, headers });
      },
    });
  },
});

const buildDeliveryAddress = (
  p: Record<string, unknown>,
): Record<string, unknown> | null => {
  const mode = p['deliveryAddressMode'] as 'none' | 'byCode' | 'inline' | undefined;
  if (!mode || mode === 'none') return null;

  if (mode === 'byCode') {
    const code = p['deliveryAddressCode'] as string | undefined;
    if (!code) {
      throw new Error('deliveryAddressMode is "byCode" but deliveryAddressCode is empty.');
    }
    return { addressCode: code };
  }

  const inline: Record<string, unknown> = {};
  const fieldMap: Array<[string, string]> = [
    ['deliveryAddressLine1', 'addressLine1'],
    ['deliveryAddressLine2', 'addressLine2'],
    ['deliveryCity', 'city'],
    ['deliveryProvince', 'province'],
    ['deliveryPostalCode', 'postalCode'],
    ['deliveryCountry', 'country'],
    ['deliveryContactName', 'contactName'],
    ['deliveryContactPhone', 'contactPhone'],
  ];
  for (const [src, dst] of fieldMap) {
    const val = p[src];
    if (typeof val === 'string' && val.length > 0) inline[dst] = val;
  }
  if (!inline['addressLine1'] || !inline['city']) {
    throw new Error('deliveryAddressMode is "inline" but addressLine1 or city is missing.');
  }
  return inline;
};

// A checkbox set from an expression arrives as the text "true" or "false".
function isOn(value: unknown): boolean {
  return value === true || value === 'true';
}
