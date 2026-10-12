import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { IfHubNotFound, nucleusHubCodes } from '../hub-codes';

export const findHubCodeForAddress = createAction({
    auth: nucleusAuth,
    name: 'find_hub_code_for_address',
    displayName: 'Find Hub Code for Address',
    description:
        'Resolve a single Nucleus hub code for an address. Tries suburb + postal code, then suburb, then postal code, then city, and never guesses when the address is ambiguous.',
    props: {
        suburb: Property.ShortText({ displayName: 'Suburb', required: false }),
        postalCode: Property.ShortText({ displayName: 'Postal Code', required: false }),
        city: Property.ShortText({ displayName: 'City', required: false }),
        province: Property.ShortText({
            displayName: 'Province',
            description: 'Used to narrow down matches that span more than one hub.',
            required: false,
        }),
        ifNotFound: Property.StaticDropdown<IfHubNotFound>({
            displayName: 'If no hub code is found',
            description:
                'Use UNK returns { hubCode: "UNK", matchedOn: "fallback", reason } when the address matches no hub or more than one. Failed calls to Nucleus still fail.',
            required: false,
            defaultValue: 'unknown',
            options: {
                options: [
                    { label: 'Use UNK (Unknown)', value: 'unknown' },
                    { label: 'Fail', value: 'fail' },
                ],
            },
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const { onFailure, ifNotFound, ...address } = context.propsValue;
        return pieceTrace.run({
            onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) =>
                nucleusHubCodes.resolveHubCode({
                    address,
                    ifNotFound: ifNotFound === 'fail' ? 'fail' : 'unknown',
                    lookup: async (query) =>
                        nucleusHubCodes.parseHubRows(
                            await nucleusClient.call({ trace, auth, store: context.store, method: HttpMethod.GET, path: 'GetHubCode', query }),
                        ),
                }),
        });
    },
});
