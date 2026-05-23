import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';

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
    },
    async run(context) {
        const endpoint = context.auth.props.invoiceEndpoint ?? 'VendorInvoice';
        return shopriteClient.call(
            context.auth.props,
            HttpMethod.POST,
            `/api/${endpoint}`,
            context.propsValue.invoiceMessage,
        );
    },
});
