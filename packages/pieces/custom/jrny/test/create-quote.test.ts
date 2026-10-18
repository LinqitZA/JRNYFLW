import { beforeEach, describe, expect, test, vi } from 'vitest';

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));
vi.mock('@activepieces/pieces-common', async (orig) => {
    const actual = await orig<typeof import('@activepieces/pieces-common')>();
    return { ...actual, httpClient: { sendRequest } };
});

import { createMockActionContext } from '@activepieces/pieces-framework';
import { createQuote } from '../src/lib/actions/create-quote';

const auth = { props: { baseUrl: 'https://jrny/', entityId: 'ent-1', entityCode: 'ZA01', bearerToken: 'jrny-bearer-123456' } };
const base = { customerCode: 'SHOE100', lines: [{ stockCode: 'CSL1388', qty: 1, unitPrice: 30 }] };

function run(props: Record<string, unknown>) {
    return createQuote.run({ ...createMockActionContext({ propsValue: { ...base, ...props } }), auth });
}

function sent() {
    return sendRequest.mock.calls[0][0];
}

describe('createQuote', () => {
    beforeEach(() => {
        sendRequest.mockReset();
        sendRequest.mockResolvedValue({ status: 201, body: { quotationNumber: 'Q-1' } });
    });

    test('sends the delivery date, auto-confirm and the idempotency key', async () => {
        await run({ autoConvert: true, autoConfirm: true, deliveryDate: '2026-10-19', idempotencyKey: 'shoprite-1221181491' });
        expect(sent().body).toMatchObject({ autoConvert: true, autoConfirm: true, deliveryDate: '2026-10-19' });
        expect(sent().headers).toMatchObject({ 'Idempotency-Key': 'shoprite-1221181491' });
    });

    test('accepts auto-confirm given as the text true from an expression', async () => {
        await run({ autoConvert: 'true', autoConfirm: 'true', deliveryDate: '2026-10-19' });
        expect(sent().body).toMatchObject({ autoConvert: true, autoConfirm: true });
    });

    test('auto-confirm off, or false as text, sends no autoConfirm', async () => {
        await run({ autoConvert: true, autoConfirm: 'false', deliveryDate: '2026-10-19' });
        expect(sent().body).not.toHaveProperty('autoConfirm');
    });

    test.each([
        [{ autoConfirm: true, deliveryDate: '2026-10-19' }, 'Auto-confirm needs Auto-convert to Sales Order turned on'],
        [{ autoConvert: true, autoConfirm: true }, 'Auto-confirm needs a Delivery Date'],
        [{ deliveryDate: '19/10/2026' }, 'Delivery Date must be YYYY-MM-DD, e.g. 2026-10-19'],
    ])('rejects %j before calling JRNY', async (props, message) => {
        const result = await run({ ...props, onFailure: 'continue' });
        expect(result).toMatchObject({ ok: false, error: { message } });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('without the new inputs the request is unchanged', async () => {
        await run({});
        expect(sent().body).toEqual({ customer: { code: 'SHOE100' }, lines: [{ stockCode: 'CSL1388', qty: 1, unitPrice: 30 }] });
        expect(sent().headers).not.toHaveProperty('Idempotency-Key');
    });

    test('sends the portal code beside the external reference', async () => {
        await run({ portalCode: 'SHOPRITE', externalReference: '1221181491' });
        expect(sent().body).toMatchObject({ portalCode: 'SHOPRITE', externalReference: '1221181491' });
    });

    test('a blank portal code is not sent', async () => {
        await run({ portalCode: '   ' });
        expect(sent().body).not.toHaveProperty('portalCode');
    });
});
