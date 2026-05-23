import { PieceAuth, Property } from '@activepieces/pieces-framework';

export const nucleusAuth = PieceAuth.CustomAuth({
    description: 'Connect to Nucleus (Winfreight FMS). Base URL, API Username/Password, and Group Name are provided by Winfreight.',
    required: true,
    props: {
        baseUrl: Property.ShortText({ displayName: 'Base URL', description: 'Winfreight API root (provided by Winfreight).', required: true }),
        username: Property.ShortText({ displayName: 'Username', required: true }),
        password: PieceAuth.SecretText({ displayName: 'Password', required: true }),
        groupName: Property.ShortText({ displayName: 'Group Name', description: 'GroupName provided by Winfreight; sent on every request.', required: true }),
    },
});

export type NucleusAuth = {
    baseUrl: string;
    username: string;
    password: string;
    groupName: string;
};
