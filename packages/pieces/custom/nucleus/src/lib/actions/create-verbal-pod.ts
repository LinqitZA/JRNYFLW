import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const createVerbalPod = createAction({
    auth: nucleusAuth,
    name: 'create_verbal_pod',
    displayName: 'Create Verbal POD',
    description: 'Record who signed for a waybill and when (createpod).',
    props: {
        waybill: Property.ShortText({ displayName: 'Waybill Number', required: true }),
        signedBy: Property.ShortText({ displayName: 'Signed By', required: true }),
        podDate: Property.ShortText({ displayName: 'Signature Date (YYYY/MM/DD)', required: true }),
        podTime: Property.ShortText({ displayName: 'Signature Time (HH:MM:SS)', required: true }),
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
                    path: 'createpod',
                    query: { Waybill: p.waybill, Podcom1: p.signedBy, Poddate: p.podDate, Podcom2: p.podTime },
                }),
        });
    },
});
