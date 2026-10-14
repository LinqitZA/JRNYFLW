import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';

// Declared before the action because its props read them when the module loads.
const COURIER_STATUSES = ['incomplete', 'pending', 'booked', 'manifested', 'collected', 'in_transit', 'delivered', 'failed'];
const ON_THE_ROAD = ['booked', 'manifested', 'collected', 'in_transit'];

export const listCourierDispatches = createAction({
  auth: jrnyAuth,
  name: 'list_courier_dispatches',
  displayName: 'List Courier Dispatches',
  description:
    'Every dispatch note matching the courier filters, across all pages. Also returns the waybills as one comma-separated list for a courier bulk lookup, and byWaybill to find a dispatch from its waybill.',
  props: {
    courierCode: Property.ShortText({
      displayName: 'Courier Code',
      description: "The courier's code in JRNY. Leave blank for every courier.",
      required: false,
    }),
    courierStatuses: Property.StaticMultiSelectDropdown({
      displayName: 'Courier Statuses',
      description: 'Defaults to the dispatches still on the road: booked, manifested, collected and in transit.',
      required: false,
      defaultValue: ON_THE_ROAD,
      options: {
        options: COURIER_STATUSES.map((status) => ({ label: status.replace('_', ' '), value: status })),
      },
    }),
    podMissing: Property.Checkbox({
      displayName: 'Only delivered without a POD',
      description: 'Lists delivered dispatches only, whatever Courier Statuses says.',
      required: false,
      defaultValue: false,
    }),
    grnMissing: Property.Checkbox({
      displayName: 'Only delivered without a GRN',
      description: 'Delivered to a customer that requires a GRN, with no GRN yet. Lists delivered dispatches only, whatever Courier Statuses says.',
      required: false,
      defaultValue: false,
    }),
    fromDate: Property.ShortText({
      displayName: 'From Date',
      description: 'Only dispatches from this date, YYYY-MM-DD.',
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
        const filters = buildFilters(p);
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/dispatch-notes`;
        const dispatchNotes: DispatchRow[] = [];
        let cursor: string | null = null;
        for (let pageNumber = 1; ; pageNumber++) {
          if (pageNumber > MAX_PAGES) {
            throw new Error(`More than ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en-US')} dispatch notes match; narrow the filters`);
          }
          const query: Record<string, string> = { ...filters, limit: String(PAGE_SIZE), ...(cursor === null ? {} : { cursor }) };
          const page: unknown = await jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.GET, path, query });
          if (!isDispatchPage(page) || (page.hasMore && !page.cursor)) {
            throw new Error('Unexpected response from JRNY');
          }
          dispatchNotes.push(...page.data);
          if (!page.hasMore) {
            break;
          }
          cursor = page.cursor;
        }
        return { count: dispatchNotes.length, dispatchNotes, ...indexByWaybill(dispatchNotes) };
      },
    });
  },
});

function buildFilters(p: {
  courierCode?: string;
  courierStatuses?: unknown;
  podMissing?: boolean;
  grnMissing?: boolean;
  fromDate?: string;
}): Record<string, string> {
  const courierCode = (p.courierCode ?? '').trim();
  const fromDate = (p.fromDate ?? '').trim();
  if (fromDate !== '' && !ISO_DATE.test(fromDate)) {
    throw new Error('From Date must be YYYY-MM-DD, e.g. 2026-10-01');
  }
  // JRNY's POD and GRN checks only match delivered dispatches, so any other status would silently return nothing.
  const statuses = p.podMissing || p.grnMissing ? ['delivered'] : chosenStatuses(p.courierStatuses);
  return {
    ...(courierCode === '' ? {} : { courierCode }),
    courierStatus: statuses.join(','),
    ...(p.podMissing ? { podMissing: 'true' } : {}),
    ...(p.grnMissing ? { grnMissing: 'true' } : {}),
    ...(fromDate === '' ? {} : { fromDate }),
  };
}

// A dynamic value arrives as text rather than the multi-select's array.
function chosenStatuses(value: unknown): string[] {
  const statuses = (Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [])
    .map((status) => status.trim())
    .filter((status) => status !== '');
  return statuses.length === 0 ? ON_THE_ROAD : statuses;
}

// Couriers return waybills upper-cased, so the index is too; the first dispatch wins if JRNY ever holds a waybill twice.
function indexByWaybill(rows: DispatchRow[]): { waybills: string; byWaybill: Record<string, DispatchRow> } {
  const byWaybill: Record<string, DispatchRow> = {};
  for (const row of rows) {
    const waybill = typeof row['waybillNumber'] === 'string' ? row['waybillNumber'].trim().toUpperCase() : '';
    if (waybill !== '' && !(waybill in byWaybill)) {
      byWaybill[waybill] = row;
    }
  }
  return { waybills: Object.keys(byWaybill).join(','), byWaybill };
}

function isDispatchPage(value: unknown): value is DispatchPage {
  if (typeof value !== 'object' || value === null || !('data' in value) || !('hasMore' in value)) {
    return false;
  }
  const cursor = 'cursor' in value ? value.cursor : null;
  return (
    Array.isArray(value.data) &&
    value.data.every((row: unknown) => typeof row === 'object' && row !== null) &&
    typeof value.hasMore === 'boolean' &&
    (cursor === null || typeof cursor === 'string')
  );
}

const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type DispatchRow = Record<string, unknown>;
type DispatchPage = { data: DispatchRow[]; cursor: string | null; hasMore: boolean };
