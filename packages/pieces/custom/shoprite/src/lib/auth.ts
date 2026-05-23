import { PieceAuth, Property } from '@activepieces/pieces-framework';

const markdown = `
Connect to Shoprite B2B Supplier Services.

You need (from Shoprite): your **Username** and **Password**, your **Contract ID**, and the **Base URL** (production: \`https://externalservices.shopriteholdings.co.za/b2bservice\`).
Credentials are sent as an encrypted (Base64) Authorization header plus Shoprite's required \`Authentication\`, \`ContractID\` and \`UIUser\` headers.
`;

export const shopriteAuth = PieceAuth.CustomAuth({
    description: markdown,
    required: true,
    props: {
        baseUrl: Property.ShortText({
            displayName: 'Base URL',
            description: 'API root, no trailing slash. Production: https://externalservices.shopriteholdings.co.za/b2bservice',
            required: true,
        }),
        username: Property.ShortText({ displayName: 'Username', required: true }),
        password: PieceAuth.SecretText({ displayName: 'Password', required: true }),
        contractId: Property.ShortText({ displayName: 'Contract ID', required: true }),
        invoiceEndpoint: Property.StaticDropdown<'VendorInvoice' | 'B2BInvoice'>({
            displayName: 'Invoice Endpoint',
            description: 'Which Shoprite invoice controller to POST invoices to. Confirm with Shoprite before go-live.',
            required: true,
            defaultValue: 'VendorInvoice',
            options: {
                options: [
                    { label: 'VendorInvoice', value: 'VendorInvoice' },
                    { label: 'B2BInvoice', value: 'B2BInvoice' },
                ],
            },
        }),
    },
});

export type ShopriteAuth = {
    baseUrl: string;
    username: string;
    password: string;
    contractId: string;
    invoiceEndpoint: 'VendorInvoice' | 'B2BInvoice' | undefined;
};
