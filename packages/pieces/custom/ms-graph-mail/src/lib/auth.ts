import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { mailAddresses } from './addresses';
import { msGraphClient } from './client';

export const msGraphMailAuth = PieceAuth.CustomAuth({
    description:
        'Sends mail as an application through Microsoft Graph, so nobody has to sign in. Your Microsoft 365 admin creates an app registration with the Mail.Send application permission and admin consent, and gives you its tenant ID, client ID and a client secret.',
    required: true,
    props: {
        tenantId: Property.ShortText({ displayName: 'Tenant ID', description: 'Directory (tenant) ID, or a domain such as contoso.onmicrosoft.com.', required: true }),
        clientId: Property.ShortText({ displayName: 'Client ID', description: 'Application (client) ID of the app registration.', required: true }),
        clientSecret: PieceAuth.SecretText({ displayName: 'Client Secret', description: "The secret's value, not its ID.", required: true }),
        senderMailbox: Property.ShortText({ displayName: 'Sender Mailbox', description: 'The address mail is sent from, e.g. notifications@yourcompany.co.za.', required: true }),
    },
    // Checking the mailbox or the Mail.Send consent would need more Graph permissions than sending does, so only the credentials are checked here.
    validate: async ({ auth }) => {
        if (!mailAddresses.isEmail(auth.senderMailbox.trim())) {
            return { valid: false, error: 'Sender Mailbox must be an email address' };
        }
        const result = await pieceTrace.run({
            onFailure: 'continue',
            secrets: msGraphClient.secretsOf(auth),
            work: (trace) => msGraphClient.getToken({ trace, auth }),
        });
        return result.ok ? { valid: true } : { valid: false, error: result.error.message };
    },
});
