import { PieceAuth, Property } from '@activepieces/pieces-framework';

const description = `
Connect to a JRNY ERP instance.

You will need:
1. **Base URL** — the JRNY API root, e.g. \`http://localhost:4200/api\` or \`https://erp.yourcompany.com/api\`.
2. **Entity ID** — the UUID of the JRNY entity this connection is bound to. The bearer token is scoped to a single entity; cross-entity calls return 403.
3. **Entity Code** — short code for the entity (e.g. \`ZA01\`). Used for display only — it is included in the connection name and run logs.
4. **Bearer Token** — generated in JRNY by an administrator with the \`integration.manage_keys\` permission. Treat as a secret.
`;

export const jrnyAuth = PieceAuth.CustomAuth({
  description,
  required: true,
  props: {
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      description: 'JRNY API root, no trailing slash. Example: http://localhost:4200/api',
      required: true,
    }),
    entityId: Property.ShortText({
      displayName: 'Entity ID',
      description: 'UUID of the JRNY entity this connection is bound to.',
      required: true,
    }),
    entityCode: Property.ShortText({
      displayName: 'Entity Code',
      description: 'Display label for the entity (e.g. ZA01). Used in run logs.',
      required: true,
    }),
    bearerToken: PieceAuth.SecretText({
      displayName: 'Bearer Token',
      description: 'Plaintext bearer token issued by JRNY. Stored encrypted.',
      required: true,
    }),
  },
});

export type JrnyAuth = {
  baseUrl: string;
  entityId: string;
  entityCode: string;
  bearerToken: string;
};
