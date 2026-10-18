import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpError, HttpMethod } from '@activepieces/pieces-common';
import { tryCatch, tryCatchSync } from '@activepieces/shared';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';
import { shopriteAuth, ShopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { gs1Invoice, Supplier } from '../gs1-invoice';
import { invoiceResponse } from '../invoice-response';

export const sendInvoice = createAction({
    auth: shopriteAuth,
    name: 'send_invoice',
    displayName: 'Send Invoice',
    description:
        'Sends one invoice to Shoprite as a GS1 invoice message (XML). Checks the invoice first and fails with the reason if anything is missing or does not add up. In a flow, set "If the call fails" to Continue and record the result back in JRNY.',
    // Optional in the builder so the action's own checks name what is missing: the engine rejects a blank required field before the step runs, where Continue can't catch it.
    props: {
        invoiceNumber: Property.ShortText({ displayName: 'Invoice Number', description: 'The JRNY invoice number. Required.', required: false }),
        invoiceDate: Property.ShortText({ displayName: 'Invoice Date', description: 'YYYY-MM-DD. Required.', required: false }),
        purchaseOrder: Property.ShortText({
            displayName: 'Purchase Order',
            description: "Shoprite's order number (the invoice's customer PO number). Required.",
            required: false,
        }),
        storeGln: Property.ShortText({
            displayName: 'Store GLN',
            description: 'The 13-digit GLN of the Shoprite store being invoiced: the buyer, ship-to and receiver. Required.',
            required: false,
        }),
        totalExclVat: Property.Number({ displayName: 'Total Excl. VAT', description: 'Required.', required: false }),
        totalVat: Property.Number({ displayName: 'Total VAT', description: 'Required.', required: false }),
        totalInclVat: Property.Number({ displayName: 'Total Incl. VAT', description: 'Required. Must match the lines to within a cent.', required: false }),
        lines: Property.Array({
            displayName: 'Lines',
            description: 'One entry per invoice line. Line VAT is worked out as incl. minus excl. and must be 15% of excl.',
            required: false,
            properties: {
                lineNumber: Property.Number({ displayName: 'Line Number', required: false }),
                quantity: Property.Number({ displayName: 'Quantity', required: false }),
                lineTotalExclVat: Property.Number({ displayName: 'Line Total Excl. VAT', required: false }),
                lineTotalInclVat: Property.Number({ displayName: 'Line Total Incl. VAT', required: false }),
                description: Property.ShortText({ displayName: 'Description', required: false }),
                gtin: Property.ShortText({
                    displayName: 'GTIN',
                    description: "Shoprite's 13- or 14-digit barcode for the item. Keep the leading zeros.",
                    required: false,
                }),
            },
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const props = context.propsValue;
        return pieceTrace.run({
            onFailure: props.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: async (trace) => {
                const supplier = supplierOf(auth);
                const { data: invoice, error: invalid } = tryCatchSync(() =>
                    gs1Invoice.check({
                        invoiceNumber: props.invoiceNumber,
                        invoiceDate: props.invoiceDate,
                        purchaseOrder: props.purchaseOrder,
                        storeGln: props.storeGln,
                        totalExclVat: props.totalExclVat,
                        totalVat: props.totalVat,
                        totalInclVat: props.totalInclVat,
                        lines: props.lines,
                    }),
                );
                if (invalid !== null) {
                    throw new SendInvoiceError({ message: invalid.message, code: 'INVALID' });
                }
                const invoiceRefNo = gs1Invoice.refNo({ supplierGln: supplier.gln, invoiceNumber: invoice.invoiceNumber });
                const xml = gs1Invoice.toXml({ invoice, supplier, invoiceRefNo, sentAt: new Date() });
                const shopriteMessage = await post({ trace, auth, xml });
                return {
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceRefNo,
                    purchaseOrder: invoice.purchaseOrder,
                    storeGln: invoice.storeGln,
                    lineCount: invoice.lines.length,
                    totalInclVat: invoice.totals.inclVatCents / 100,
                    shopriteMessage,
                };
            },
        });
    },
});

async function post({ trace, auth, xml }: { trace: Tracer; auth: ShopriteAuth; xml: string }): Promise<string> {
    const { data: response, error } = await tryCatch(() =>
        shopriteClient.send<unknown>({
            trace,
            auth,
            method: HttpMethod.POST,
            path: `/api/${auth.invoiceEndpoint ?? 'VendorInvoice'}`,
            headers: { 'Content-Type': 'application/xml' },
            body: xml,
        }),
    );
    if (error !== null) {
        if (!(error instanceof HttpError)) {
            throw error;
        }
        const { status, body } = error.response;
        // pieces-common reports a dropped connection or timeout as a 500 with no body, so the invoice may still have landed.
        if (status >= 500 && (body === undefined || body === null || body === '')) {
            throw new SendInvoiceError({ message: invoiceResponse.noAnswer(), code: 'UNCONFIRMED' });
        }
        throw new SendInvoiceError({ message: invoiceResponse.failure({ status, body }), code: 'REJECTED' });
    }
    const message = invoiceResponse.confirmation(response.body);
    if (message === null) {
        throw new SendInvoiceError({ message: invoiceResponse.unconfirmed({ status: response.status, body: response.body }), code: 'UNCONFIRMED' });
    }
    return message;
}

function supplierOf(auth: ShopriteAuth): Supplier {
    const gln = (auth.supplierGln ?? '').trim();
    const vatRegistrationNumber = (auth.vatRegistrationNumber ?? '').trim();
    if (gln === '') {
        throw new SendInvoiceError({ message: 'Add the Supplier GLN to the Shoprite connection', code: 'INVALID' });
    }
    if (!gs1Invoice.isGln(gln)) {
        throw new SendInvoiceError({ message: `The Supplier GLN on the Shoprite connection (${gln}) must be 13 digits with a valid check digit`, code: 'INVALID' });
    }
    if (vatRegistrationNumber === '') {
        throw new SendInvoiceError({ message: 'Add the VAT Registration Number to the Shoprite connection', code: 'INVALID' });
    }
    return { gln, vatRegistrationNumber };
}

// The code reaches the step output as error.code, so the flow can hold back an UNCONFIRMED invoice instead of resending it next run.
class SendInvoiceError extends Error {
    readonly code: SendInvoiceErrorCode;

    constructor({ message, code }: { message: string; code: SendInvoiceErrorCode }) {
        super(message);
        this.code = code;
    }
}

type SendInvoiceErrorCode = 'INVALID' | 'REJECTED' | 'UNCONFIRMED';
