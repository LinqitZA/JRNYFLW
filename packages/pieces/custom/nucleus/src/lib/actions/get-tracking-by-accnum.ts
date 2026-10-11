import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const getTrackingByAccnum = createAction({
    auth: nucleusAuth,
    name: 'get_tracking_by_accnum',
    displayName: 'Get Tracking by Account',
    description: 'List tracking events for an account over a date range (poll for delivered shipments).',
    props: {
        accnum: Property.ShortText({ displayName: 'Account Number', required: true }),
        dateFrom: Property.ShortText({ displayName: 'Date From (DD/MM/YYYY)', required: true }),
        dateTo: Property.ShortText({ displayName: 'Date To (DD/MM/YYYY)', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const p = context.propsValue;
        return pieceTrace.run({
            onFailure: p.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: (trace) =>
                nucleusClient.call({
                    trace,
                    auth,
                    store: context.store,
                    method: HttpMethod.GET,
                    path: 'GetTrackingByAccnum',
                    query: { Accnum: p.accnum, DateFrom: p.dateFrom, DateTo: p.dateTo },
                }),
        });
    },
});
