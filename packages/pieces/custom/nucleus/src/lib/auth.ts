import { PieceAuth, Property } from '@activepieces/pieces-framework';

export const nucleusAuth = PieceAuth.CustomAuth({
    description: 'Connect to Nucleus (Winfreight FMS). Base URL, API Username/Password, and Group Name are provided by Winfreight.',
    required: true,
    props: {
        baseUrl: Property.ShortText({ displayName: 'Base URL', description: 'Winfreight API root (provided by Winfreight).', required: true }),
        username: Property.ShortText({ displayName: 'Username', required: true }),
        password: PieceAuth.SecretText({ displayName: 'Password', required: true }),
        groupName: Property.ShortText({ displayName: 'Group Name', description: 'GroupName provided by Winfreight; sent on every request.', required: true }),
        trackingUrl: Property.ShortText({
            displayName: 'Tracking URL',
            description: 'Provided by Nucleus. The waybill number is added to the end to make each tracking link. Leave blank for no tracking links.',
            required: false,
        }),
        podUrl: Property.ShortText({
            displayName: 'POD URL',
            description: 'Provided by Nucleus. The waybill number is added to the end to make each proof-of-delivery link. Leave blank for no POD links.',
            required: false,
        }),
    },
});

export type NucleusAuth = {
    baseUrl: string;
    username: string;
    password: string;
    groupName: string;
    trackingUrl?: string;
    podUrl?: string;
};
