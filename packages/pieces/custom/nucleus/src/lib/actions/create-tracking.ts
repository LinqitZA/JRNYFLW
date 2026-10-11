import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const createTracking = createAction({
    auth: nucleusAuth,
    name: 'create_tracking',
    displayName: 'Create Tracking Event',
    description: 'Add a tracking event to a waybill (createtrack).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        dateStamp: Property.ShortText({ displayName: 'Event Date (YYYY/MM/DD)', required: true }),
        eventCode: Property.ShortText({
            displayName: 'Event Code',
            description: 'Tracking code for the action taken, e.g. DEL.',
            required: true,
        }),
        actionTaken: Property.ShortText({
            displayName: 'Action Taken',
            description: 'Description of the event, e.g. "Waybill out for Delivery".',
            required: true,
        }),
        person: Property.ShortText({
            displayName: 'Actioned By',
            description: 'Person or company who actioned the event.',
            required: true,
        }),
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
                    method: HttpMethod.POST,
                    path: 'createtrack',
                    query: { Waybill: p.waybill, DateStamp: p.dateStamp, EventCode: p.eventCode, ActionTaken: p.actionTaken, Person: p.person },
                }),
        });
    },
});
