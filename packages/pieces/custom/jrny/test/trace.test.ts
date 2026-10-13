import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { HttpError } from '@activepieces/pieces-common';
import { createMockActionContext } from '@activepieces/pieces-framework';
import { AxiosError, AxiosHeaders } from 'axios';
import { courierResponse } from '../src/lib/actions/courier-response';
import { buildJrnyAction } from '../src/lib/action-factory';
import { jrnyOperations } from '../src/lib/operations';

const TOKEN = 'jrny-bearer-123456';
const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: TOKEN } };

describe('jrny trace', () => {
    beforeEach(() => {
        sendRequest.mockReset();
    });

    test('Courier Response records the PATCH with the bearer token redacted', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { courierStatus: 'failed' } });
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'failed', errorMessage: 'Find Hub Code: ambiguous' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toEqual({
            ok: true,
            output: { courierStatus: 'failed' },
            sent: [{
                method: 'PATCH',
                url: 'https://jrny/api/v1/integration/entities/ent-1/dispatch-notes/DN-000026/courier-response',
                query: {},
                headers: { 'Content-Type': 'application/json', Authorization: '[redacted]' },
                body: { courierStatus: 'failed', errorMessage: 'Find Hub Code: ambiguous' },
                status: 200,
                durationMs: expect.any(Number),
            }],
        });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('continue mode returns a JRNY error envelope as data with its status', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config,
            data: { error: { code: 'CONFLICT', message: 'Waybill number already in use' } },
        })));
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'booked', waybillNumber: 'AON-1', onFailure: 'continue' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toMatchObject({
            ok: false,
            output: null,
            error: { message: 'JRNY API error 409 CONFLICT: Waybill number already in use', status: 409 },
        });
    });

    test('keeps JRNY error details and request ID in the error message', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, {
            status: 422, statusText: 'Unprocessable', headers: {}, config,
            data: { error: { code: 'VALIDATION', message: 'Invalid lines', details: { 'lines.2.stockCode': 'unknown' } }, requestId: 'req-42' },
        })));
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'failed', onFailure: 'continue' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toMatchObject({ ok: false, error: { status: 422 } });
        const message = result.ok ? '' : result.error.message;
        expect(message).toContain('JRNY API error 422 VALIDATION: Invalid lines');
        expect(message).toContain('{"lines.2.stockCode":"unknown"}');
        expect(message).toContain('req-42');
    });

    test('continue mode gives the JRNY error code, every code in the details, and the details', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, {
            status: 400, statusText: 'Bad Request', headers: {}, config,
            data: {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed for 2 line items',
                    details: { lines: [
                        { index: 19, stockCode: 'AA402860', code: 'STOCK_ITEM_NOT_FOUND', message: "Stock item 'AA402860' not found" },
                        { index: 20, stockCode: '6003501', code: 'STOCK_ITEM_NOT_FOUND', message: "Stock item '6003501' not found" },
                        { index: 21, addressCode: 'S0110', code: 'ADDRESS_NOT_FOUND', message: 'unknown address' },
                    ] },
                },
                requestId: 'f5758e53',
            },
        })));
        const propsValue = { dispatchNumber: 'DN-000026', courierStatus: 'booked', onFailure: 'continue' };
        const result = await courierResponse.run({ ...createMockActionContext({ propsValue }), auth });
        expect(result).toMatchObject({
            ok: false,
            error: {
                status: 400,
                code: 'VALIDATION_ERROR',
                codes: ['VALIDATION_ERROR', 'STOCK_ITEM_NOT_FOUND', 'ADDRESS_NOT_FOUND'],
                details: { lines: [{ stockCode: 'AA402860' }, { stockCode: '6003501' }, { addressCode: 'S0110' }] },
            },
        });
    });

    test('generated actions describe JRNY error envelopes the same way as the curated ones', async () => {
        const config = { headers: new AxiosHeaders() };
        sendRequest.mockRejectedValueOnce(new HttpError({}, new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, {
            status: 422, statusText: 'Unprocessable', headers: {}, config,
            data: { error: { code: 'CREDIT_CHECK_FAILED', message: 'Over the credit limit' }, requestId: 'req-7' },
        })));
        const action = buildJrnyAction({
            name: 'confirm_sales_order', displayName: 'Confirm Sales Order', description: '', method: 'POST',
            path: '/api/v1/integration/entities/{entityId}/sales-orders/{orderNumber}/confirm', tag: 'x',
            pathParams: ['orderNumber'], queryParams: [], hasBody: false,
        });
        const result = await action.run({ ...createMockActionContext({ propsValue: { orderNumber: 'SO-1', onFailure: 'continue' } }), auth });
        expect(result).toMatchObject({
            ok: false,
            error: { message: 'JRNY API error 422 CREDIT_CHECK_FAILED: Over the credit limit (request req-7)', status: 422, code: 'CREDIT_CHECK_FAILED', codes: ['CREDIT_CHECK_FAILED'] },
        });
    });

    test('generated actions record the call through the real client', async () => {
        sendRequest.mockResolvedValueOnce({ status: 200, body: { code: 'ACME' } });
        const action = buildJrnyAction({
            name: 'get_customer', displayName: 'Get Customer', description: '', method: 'GET',
            path: '/api/v1/integration/entities/{entityId}/customers/{code}', tag: 'x',
            pathParams: ['code'], queryParams: [], hasBody: false,
        });
        const result = await action.run({ ...createMockActionContext({ propsValue: { code: 'ACME' } }), auth });
        expect(result.output).toEqual({ code: 'ACME' });
        expect(result.sent[0]).toMatchObject({ method: 'GET', url: 'https://jrny/api/v1/integration/entities/ent-1/customers/ACME', headers: { Authorization: '[redacted]' } });
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    test('no JRNY operation already uses a parameter named onFailure', () => {
        for (const op of jrnyOperations) {
            expect(op.pathParams).not.toContain('onFailure');
            expect(op.queryParams.map((q) => q.name)).not.toContain('onFailure');
        }
    });
});
