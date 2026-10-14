import { createAction, Property } from '@activepieces/pieces-framework';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { mailAddresses } from '../addresses';
import { msGraphMailAuth } from '../auth';
import { msGraphClient } from '../client';

export const sendEmail = createAction({
    auth: msGraphMailAuth,
    name: 'send_email',
    displayName: 'Send Email',
    description: "Send an email from the connection's sender mailbox through Microsoft Graph.",
    props: {
        to: Property.ShortText({ displayName: 'To', description: 'One or more addresses, separated by commas or semicolons.', required: true }),
        cc: Property.ShortText({ displayName: 'CC', required: false }),
        bcc: Property.ShortText({ displayName: 'BCC', required: false }),
        subject: Property.ShortText({ displayName: 'Subject', required: true }),
        body: Property.LongText({ displayName: 'Body', required: true }),
        bodyType: Property.StaticDropdown<'HTML' | 'Text'>({
            displayName: 'Body Type',
            required: false,
            defaultValue: 'HTML',
            options: { options: [{ label: 'HTML', value: 'HTML' }, { label: 'Text', value: 'Text' }] },
        }),
        replyTo: Property.ShortText({ displayName: 'Reply To', description: 'One address replies should go to instead of the sender mailbox.', required: false }),
        saveToSentItems: Property.Checkbox({ displayName: 'Save to Sent Items', required: false, defaultValue: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: msGraphClient.secretsOf(auth),
            work: async (trace) => {
                const to = mailAddresses.parse(p.to);
                const cc = mailAddresses.parse(p.cc);
                const bcc = mailAddresses.parse(p.bcc);
                const replyTo = mailAddresses.parse(p.replyTo);
                if (to.length === 0) {
                    throw new Error('To needs at least one email address');
                }
                if (replyTo.length > 1) {
                    throw new Error('Reply To takes one email address');
                }
                const payload = {
                    message: {
                        subject: p.subject,
                        body: { contentType: p.bodyType === 'Text' ? 'Text' : 'HTML', content: p.body },
                        toRecipients: recipients(to),
                        ccRecipients: recipients(cc),
                        bccRecipients: recipients(bcc),
                        replyTo: recipients(replyTo),
                    },
                    saveToSentItems: p.saveToSentItems !== false,
                };
                const token = await msGraphClient.getToken({ trace, auth });
                await msGraphClient.sendMail({ trace, auth, token, payload });
                return { from: auth.senderMailbox.trim(), to, cc, bcc, subject: p.subject };
            },
        });
    },
});

function recipients(addresses: string[]): Array<{ emailAddress: { address: string } }> {
    return addresses.map((address) => ({ emailAddress: { address } }));
}
