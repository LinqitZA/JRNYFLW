import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { jrny } from '../src';
import { generatePick } from '../src/lib/actions/generate-pick';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };

function run(propsValue: Record<string, unknown>) {
    return generatePick.run({ ...createMockActionContext({ propsValue }), auth });
}

describe('generatePick', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('POSTs generate-pick for the sales order and returns the pick', async () => {
        sendRequest.mockResolvedValueOnce({ status: 201, body: { pickNumber: 'PK-1', lines: [] } });
        const result = await run({ salesOrderNumber: ' SO/0042 ' });
        expect(sendRequest.mock.calls[0][0]).toMatchObject({
            method: 'POST', url: 'https://jrny/api/v1/integration/entities/ent-1/sales-orders/SO%2F0042/generate-pick',
        });
        expect(result.output).toEqual({ pickNumber: 'PK-1', lines: [] });
    });

    test('a 409 (not confirmed, or already picked) comes back with its code for a Router', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config,
            data: { error: { code: 'SALES_ORDER_NOT_CONFIRMED', message: 'Sales order is not confirmed' } },
        })));
        const result = await run({ salesOrderNumber: 'SO-1', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { status: 409, code: 'SALES_ORDER_NOT_CONFIRMED' } });
    });

    test('a blank sales order number fails before calling JRNY', async () => {
        const result = await run({ salesOrderNumber: '  ', onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message: 'Sales Order Number is required' } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('the piece lists Resolve Order Lines and Generate Pick once each', () => {
        const names = Object.keys(jrny.actions());
        expect(names.filter((name) => name === 'generate_pick')).toHaveLength(1);
        expect(names).toContain('resolve_order_lines');
    });
});
