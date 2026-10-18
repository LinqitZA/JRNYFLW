import { PieceAuth, Property } from '@activepieces/pieces-framework';

const markdown = `
Connect to Shoprite B2B Supplier Services.

You need (from Shoprite): your **Username** and **Password**, your **Contract ID**, and the **Base URL** (production: \`https://externalservices.shopriteholdings.co.za/b2bservice\`).
Credentials are sent as an encrypted (Base64) Authorization header plus Shoprite's required \`Authentication\`, \`ContractID\` and \`UIUser\` headers.

To send invoices, also fill in your **Supplier GLN** and **VAT Registration Number**.
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
        supplierGln: Property.ShortText({
            displayName: 'Supplier GLN',
            description: 'Your 13-digit GLN as a Shoprite supplier: the sender on every invoice. Needed for Send Invoice.',
            required: false,
        }),
        vatRegistrationNumber: Property.ShortText({
            displayName: 'VAT Registration Number',
            description: 'Your VAT registration number, as printed on your invoices. Needed for Send Invoice.',
            required: false,
        }),
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
    supplierGln?: string;
    vatRegistrationNumber?: string;
};
