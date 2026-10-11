import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const uploadInvoice = createAction({
    auth: shopriteAuth,
    name: 'upload_invoice',
    displayName: 'Upload Invoice',
    description: 'POST a GS1 InvoiceMessageType document to Shoprite. Build the message with the Mapper from your JRNY invoice data.',
    props: {
        invoiceMessage: Property.Json({
            displayName: 'Invoice Message (GS1)',
            description: 'The full GS1 InvoiceMessageType JSON. Produce this with the Mapper step.',
            required: true,
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: (trace) =>
                shopriteClient.call({
                    trace,
                    auth,
                    method: HttpMethod.POST,
                    path: `/api/${auth.invoiceEndpoint ?? 'VendorInvoice'}`,
                    body: context.propsValue.invoiceMessage,
                }),
        });
    },
});
