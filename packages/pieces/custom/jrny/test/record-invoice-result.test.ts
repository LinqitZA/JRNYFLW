import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { recordInvoiceResult } from '../src/lib/actions/record-invoice-result';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };
const URL = 'https://jrny/api/v1/integration/entities/ent-1/invoices/INV%2F1/api-delivery';

function run(propsValue: Record<string, unknown>) {
    return recordInvoiceResult.run({ ...createMockActionContext({ propsValue: { invoiceNumber: 'INV/1', ...propsValue } }), auth });
}
const sent = () => sendRequest.mock.calls[0][0];

describe('recordInvoiceResult', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        sendRequest.mockResolvedValue({ status: 200, body: { data: { documentNumber: 'INV/1', changed: true } } });
    });

    test('records sent with the reference, a Z time and a per-run idempotency key', async () => {
        const result = await run({ status: 'sent', externalReference: 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9' });
        expect(sent().url).toBe(URL);
        expect(sent().method).toBe('POST');
        expect(sent().body).toEqual({ status: 'sent', externalReference: 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9', occurredAt: expect.stringMatching(/Z$/) });
        expect(sent().headers['Idempotency-Key']).toBe('jrnyflw-test-run-id-invoice-INV/1-sent');
        expect(result).toMatchObject({ ok: true, output: { documentNumber: 'INV/1', changed: true } });
    });

    test('records failed as "CODE: message"', async () => {
        await run({ status: 'failed', errorCode: 'REJECTED', message: 'Shoprite said no' });
        expect(sent().body).toMatchObject({ status: 'failed', message: 'REJECTED: Shoprite said no' });
        expect(sent().body).not.toHaveProperty('externalReference');
    });

    test('a failed step with no code or message still records why', async () => {
        await run({ status: 'failed', errorCode: '', message: '' });
        expect(sent().body.message).toBe('Send Invoice failed before it ran; see this run in JRNYFLW');
    });

    test('caps the message at 2,000 characters', async () => {
        await run({ status: 'failed', errorCode: 'INVALID', message: 'x'.repeat(3000) });
        expect(sent().body.message).toHaveLength(2000);
        expect(sent().body.message.endsWith('…')).toBe(true);
    });

    test.each([
        [{ invoiceNumber: ' ', status: 'sent', externalReference: 'r' }, 'Invoice Number is required'],
        [{ status: 'sent', externalReference: ' ' }, 'External Reference is required when the status is sent'],
        [{ status: 'maybe' }, 'Status must be sent or failed'],
    ])('rejects %j before calling JRNY', async (props, message) => {
        const result = await run({ ...props, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message } });
        expect(sendRequest).not.toHaveBeenCalled();
    });
});
