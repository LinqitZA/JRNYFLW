import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';

export const recordInvoiceResult = createAction({
  auth: jrnyAuth,
  name: 'record_invoice_result',
  displayName: 'Record Invoice Result',
  description: 'Tells JRNY an invoice was sent to the customer (it stops being listed as unsent) or failed (JRNY shows the reason).',
  props: {
    invoiceNumber: Property.ShortText({ displayName: 'Invoice Number', required: false }),
    status: Property.StaticDropdown<'sent' | 'failed'>({
      displayName: 'Status',
      required: true,
      defaultValue: 'sent',
      options: { options: [{ label: 'Sent', value: 'sent' }, { label: 'Failed', value: 'failed' }] },
    }),
    externalReference: Property.ShortText({
      displayName: 'External Reference',
      description: "Required for sent: the customer's reference for the invoice, e.g. Send Invoice's invoiceRefNo.",
      required: false,
    }),
    errorCode: Property.ShortText({ displayName: 'Error Code', description: 'For failed, e.g. INVALID, REJECTED or UNCONFIRMED. Goes in front of the message.', required: false }),
    message: Property.LongText({ displayName: 'Message', description: 'For failed: why it failed.', required: false }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const invoiceNumber = (p.invoiceNumber ?? '').trim();
        if (invoiceNumber === '') throw new Error('Invoice Number is required');
        const status = String(p.status ?? '');
        if (status !== 'sent' && status !== 'failed') throw new Error('Status must be sent or failed');
        const occurredAt = new Date().toISOString();
        const body = status === 'sent' ? sentBody({ externalReference: p.externalReference, occurredAt }) : { status, message: failureMessage({ code: p.errorCode, message: p.message }), occurredAt };
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/invoices/${encodeURIComponent(invoiceNumber)}/api-delivery`;
        // Per run, so an engine retry of this step repeats safely while the next run's report is a new one.
        const headers = { 'Idempotency-Key': `jrnyflw-${context.run.id}-invoice-${invoiceNumber}-${status}` };
        const response = await jrnyClient.callJrny<unknown>({ trace, auth, method: HttpMethod.POST, path, body, headers });
        return isRecord(response) && isRecord(response['data']) ? response['data'] : response;
      },
    });
  },
});

function sentBody({ externalReference, occurredAt }: { externalReference: unknown; occurredAt: string }): Record<string, string> {
  const reference = String(externalReference ?? '').trim();
  if (reference === '') throw new Error('External Reference is required when the status is sent');
  return { status: 'sent', externalReference: reference.slice(0, MAX_REFERENCE), occurredAt };
}

// JRNY refuses failed without a message, and a step that failed in the engine leaves no code or message to pass on.
function failureMessage({ code, message }: { code: unknown; message: unknown }): string {
  const codeText = String(code ?? '').trim();
  const messageText = String(message ?? '').trim();
  const joined = codeText !== '' && messageText !== '' ? `${codeText}: ${messageText}` : codeText || messageText || 'Send Invoice failed before it ran; see this run in JRNYFLW';
  return joined.length <= MAX_MESSAGE ? joined : `${joined.slice(0, MAX_MESSAGE - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MAX_MESSAGE = 2000;
const MAX_REFERENCE = 255;
