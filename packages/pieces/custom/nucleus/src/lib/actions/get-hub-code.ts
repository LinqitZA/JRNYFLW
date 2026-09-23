import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

export const getHubCode = createAction({
    auth: nucleusAuth,
    name: 'get_hub_code',
    displayName: 'Get Hub Code',
    description:
        'Look up Winfreight hub codes by postal code, suburb, city or province. Use the HubCode as the Sender/Receiver Hub Code (Orig_Code / Dest_Code) when creating waybills.',
    props: {
        postal: Property.ShortText({ displayName: 'Postal Code', required: false }),
        suburb: Property.ShortText({ displayName: 'Suburb', required: false }),
        city: Property.ShortText({ displayName: 'City', required: false }),
        province: Property.ShortText({ displayName: 'Province', required: false }),
    },
    async run(context) {
        const p = context.propsValue;
        const query: Record<string, string> = {
            ...spread('Postal', p.postal),
            ...spread('Suburb', p.suburb),
            ...spread('City', p.city),
            ...spread('Province', p.province),
        };
        if (Object.keys(query).length === 0) {
            throw new Error('Provide at least one of Postal Code, Suburb, City or Province');
        }
        return nucleusClient.call({ auth: context.auth.props, store: context.store, method: HttpMethod.GET, path: 'GetHubCode', query });
    },
});

function spread(key: string, value: string | undefined): Record<string, string> {
    return value === undefined || value.trim() === '' ? {} : { [key]: value.trim() };
}
