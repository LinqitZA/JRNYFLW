import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { listCourierDispatches } from '../src/lib/actions/list-courier-dispatches';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };

function page({ data, cursor, hasMore }: { data: unknown[]; cursor: string | null; hasMore: boolean }) {
    return { status: 200, body: { data, cursor, hasMore } };
}

function run(propsValue: Record<string, unknown>) {
    return listCourierDispatches.run({ ...createMockActionContext({ propsValue }), auth });
}

function queries() {
    return sendRequest.mock.calls.map((c) => c[0].queryParams);
}

describe('listCourierDispatches', () => {
    beforeEach(() => sendRequest.mockReset());

    test('follows the cursor until hasMore is false and returns every row', async () => {
        sendRequest
            .mockResolvedValueOnce(page({ data: [{ dispatchNumber: 'DN-1', waybillNumber: 'AON-1' }], cursor: 'DN-1', hasMore: true }))
            .mockResolvedValueOnce(page({ data: [{ dispatchNumber: 'DN-2', waybillNumber: 'AON-2' }], cursor: null, hasMore: false }));
        const result = await run({ courierStatuses: ['booked'] });
        expect(sendRequest.mock.calls[0][0].url).toBe('https://jrny/api/v1/integration/entities/ent-1/dispatch-notes');
        expect(queries()).toEqual([
            { courierStatus: 'booked', limit: '200' },
            { courierStatus: 'booked', limit: '200', cursor: 'DN-1' },
        ]);
        expect(result.output).toMatchObject({ count: 2, dispatchNotes: [{ dispatchNumber: 'DN-1' }, { dispatchNumber: 'DN-2' }] });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('defaults to the dispatches still on the road', async () => {
        sendRequest.mockResolvedValueOnce(page({ data: [], cursor: null, hasMore: false }));
        await run({});
        expect(queries()[0]).toEqual({ courierStatus: 'booked,manifested,collected,in_transit', limit: '200' });
    });

    test('sends the courier code, POD and GRN filters and the from date', async () => {
        sendRequest.mockResolvedValueOnce(page({ data: [], cursor: null, hasMore: false }));
        await run({ courierCode: ' NUCLEUS ', courierStatuses: ['booked'], podMissing: true, grnMissing: true, fromDate: '2026-10-01' });
        expect(queries()[0]).toEqual({
            courierCode: 'NUCLEUS', courierStatus: 'delivered', podMissing: 'true', grnMissing: 'true', fromDate: '2026-10-01', limit: '200',
        });
    });

    test('asks for delivered dispatches when only the GRN or POD check is ticked, whatever statuses are set', async () => {
        sendRequest.mockResolvedValue(page({ data: [], cursor: null, hasMore: false }));
        await run({ grnMissing: true });
        await run({ podMissing: true, courierStatuses: ['booked', 'manifested', 'collected', 'in_transit'] });
        expect(queries().map((q) => q.courierStatus)).toEqual(['delivered', 'delivered']);
    });

    test('accepts statuses given as a comma-separated dynamic value, and treats null as the default', async () => {
        sendRequest.mockResolvedValue(page({ data: [], cursor: null, hasMore: false }));
        await run({ courierStatuses: ' booked, collected ' });
        await run({ courierStatuses: null });
        expect(queries().map((q) => q.courierStatus)).toEqual(['booked,collected', 'booked,manifested,collected,in_transit']);
    });

    test('rejects a from date that is not YYYY-MM-DD before calling JRNY', async () => {
        const result = await run({ fromDate: '01/10/2026', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'From Date must be YYYY-MM-DD, e.g. 2026-10-01' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('lists the waybills upper-cased and de-duplicated, and indexes the rows by waybill', async () => {
        const rows = [
            { dispatchNumber: 'DN-1', waybillNumber: 'aon-1', courierStatus: 'booked' },
            { dispatchNumber: 'DN-2', waybillNumber: null, courierStatus: 'pending' },
            { dispatchNumber: 'DN-3', waybillNumber: ' SHP-9 ', courierStatus: 'manifested' },
            { dispatchNumber: 'DN-4', waybillNumber: 'AON-1', courierStatus: 'booked' },
            { dispatchNumber: 'DN-5', waybillNumber: '  ', courierStatus: 'pending' },
        ];
        sendRequest.mockResolvedValueOnce(page({ data: rows, cursor: null, hasMore: false }));
        const result = await run({});
        expect(result.output).toEqual({
            count: 5,
            dispatchNotes: rows,
            waybills: 'AON-1,SHP-9',
            byWaybill: { 'AON-1': rows[0], 'SHP-9': rows[2] },
        });
    });

    test('stops after 50 pages and asks for narrower filters', async () => {
        sendRequest.mockResolvedValue(page({ data: [{ dispatchNumber: 'DN-1' }], cursor: 'DN-1', hasMore: true }));
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'More than 10,000 dispatch notes match; narrow the filters' } });
        expect(sendRequest).toHaveBeenCalledTimes(50);
    });

    test('fails clearly on a page that is not a dispatch list', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { items: [] } });
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from JRNY' } });
    });

    test('stops when JRNY says there is more but gives no cursor', async () => {
        sendRequest.mockResolvedValueOnce(page({ data: [{ dispatchNumber: 'DN-1' }], cursor: null, hasMore: true }));
        const result = await run({ onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Unexpected response from JRNY' } });
    });
});
