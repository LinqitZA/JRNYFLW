import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { jrnyAuth, JrnyAuth } from '../auth';
import { JrnyApiError, jrnyClient } from '../client';
import { invoiceReadiness, ReadyInvoice } from '../invoice-readiness';

// Declared before the action because its props read it when the module loads.
const DEFAULT_MAX = 50;

export const listInvoicesReady = createAction({
  auth: jrnyAuth,
  name: 'list_invoices_ready_to_send',
  displayName: 'List Invoices Ready to Send',
  description:
    "A customer's invoices that are delivered (POD on every dispatch) and not yet sent, oldest first, with their lines in Send Invoice's shape. Invoices missing a GTIN or GLN come back with clean false and a problem to record.",
  props: {
    customerCode: Property.ShortText({ displayName: 'Customer Code', description: 'e.g. SHOE100', required: true }),
    fromDate: Property.ShortText({
      displayName: 'From Date',
      description: 'The switch-over date, YYYY-MM-DD. Invoices before it were sent by the old platform and are never sent again.',
      required: true,
    }),
    maxInvoices: Property.Number({
      displayName: 'Max Invoices',
      description: 'Most clean invoices per run (default 50). Invoices with a problem are always listed.',
      required: false,
      defaultValue: DEFAULT_MAX,
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
        const customerCode = (p.customerCode ?? '').trim();
        const fromDate = (p.fromDate ?? '').trim();
        if (customerCode === '') throw new Error('Customer Code is required');
        if (fromDate === '') throw new Error('From Date is required: the switch-over date, YYYY-MM-DD. Invoices before it were sent by the old platform.');
        if (!ISO_DATE.test(fromDate)) throw new Error('From Date must be YYYY-MM-DD, e.g. 2026-10-20');
        const maxInvoices = typeof p.maxInvoices === 'number' && p.maxInvoices >= 1 ? Math.floor(p.maxInvoices) : DEFAULT_MAX;
        const entity = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}`;
        const waiting = { noPurchaseOrder: 0, unconfirmed: 0, noSalesOrder: 0, noDispatch: 0, notDelivered: 0, overLimit: 0 };
        const invoices: ReadyInvoice[] = [];
        let clean = 0;
        for (const apiDelivery of ['unsent', 'failed']) {
          const rows = await listAll({ trace, auth, path: `${entity}/invoices`, query: { customerCode, apiDelivery, fromDate } });
          for (const row of rows) {
            const skip = invoiceReadiness.screen(row);
            if (skip !== null) {
              waiting[skip] += 1;
              continue;
            }
            const invoiceNumber = String(row['invoiceNumber']);
            const detail = await withBackoff(() => jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.GET, path: `${entity}/invoices/${encodeURIComponent(invoiceNumber)}` }));
            const salesOrderNumber = isRecord(detail) && typeof detail['salesOrderNumber'] === 'string' ? detail['salesOrderNumber'].trim() : '';
            const dispatches = salesOrderNumber === '' ? [] : await listAll({ trace, auth, path: `${entity}/dispatch-notes`, query: { salesOrderNumber } });
            const assessment = invoiceReadiness.assess({ detail, dispatches });
            if (assessment.kind === 'waiting') {
              waiting[assessment.reason] += 1;
              continue;
            }
            if (assessment.invoice.clean) {
              if (clean >= maxInvoices) {
                waiting.overLimit += 1;
                continue;
              }
              clean += 1;
            }
            invoices.push(assessment.invoice);
          }
        }
        return { count: invoices.length, invoices, clean, withProblems: invoices.length - clean, waiting };
      },
    });
  },
});

async function listAll({ trace, auth, path, query }: { trace: Tracer; auth: JrnyAuth; path: string; query: Record<string, string> }): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 1; ; pageNumber++) {
    if (pageNumber > MAX_PAGES) {
      throw new Error(`More than ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en-US')} records match ${path}; set a later From Date`);
    }
    const pageQuery: Record<string, string> = { ...query, limit: String(PAGE_SIZE), ...(cursor === null ? {} : { cursor }) };
    const page: unknown = await withBackoff(() => jrnyClient.request<unknown>({ trace, auth, method: HttpMethod.GET, path, query: pageQuery }));
    if (!isPage(page) || (page.hasMore && !page.cursor)) {
      throw new Error('Unexpected response from JRNY');
    }
    rows.push(...page.data);
    if (!page.hasMore) return rows;
    cursor = page.cursor;
  }
}

// JRNY rate-limits bursts; one invoice costs two or three calls, so a run of any size meets a 429 sooner or later.
async function withBackoff<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof JrnyApiError) || err.httpStatus !== 429 || attempt >= BACKOFF_SECONDS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_SECONDS[attempt] * 1000));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPage(value: unknown): value is { data: Record<string, unknown>[]; cursor: string | null; hasMore: boolean } {
  if (!isRecord(value) || !Array.isArray(value['data']) || typeof value['hasMore'] !== 'boolean') return false;
  const cursor = value['cursor'] ?? null;
  return value['data'].every(isRecord) && (cursor === null || typeof cursor === 'string');
}

const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const BACKOFF_SECONDS = [2, 4, 8, 16];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
