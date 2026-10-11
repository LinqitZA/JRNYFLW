import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { nucleusHubCodes } from '../hub-codes';

export const findHubCodeForAddress = createAction({
    auth: nucleusAuth,
    name: 'find_hub_code_for_address',
    displayName: 'Find Hub Code for Address',
    description:
        'Resolve a single Nucleus hub code for an address. Tries suburb + postal code, then suburb, then postal code, then city, and fails rather than guess when the address is ambiguous.',
    props: {
        suburb: Property.ShortText({ displayName: 'Suburb', required: false }),
        postalCode: Property.ShortText({ displayName: 'Postal Code', required: false }),
        city: Property.ShortText({ displayName: 'City', required: false }),
        province: Property.ShortText({
            displayName: 'Province',
            description: 'Used to narrow down matches that span more than one hub.',
            required: false,
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const { onFailure, ...address } = context.propsValue;
        return pieceTrace.run({
            onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) =>
                nucleusHubCodes.resolveHubCode({
                    address,
                    lookup: async (query) =>
                        nucleusHubCodes.parseHubRows(
                            await nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetHubCode', query }),
                        ),
                }),
        });
    },
});
