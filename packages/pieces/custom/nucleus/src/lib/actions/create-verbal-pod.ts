import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';

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
    },
    async run(context) {
        const p = context.propsValue;
        return nucleusClient.call({
            auth: context.auth.props,
            store: context.store,
            method: HttpMethod.POST,
            path: 'createpod',
            query: { Waybill: p.waybill, Podcom1: p.signedBy, Poddate: p.podDate, Podcom2: p.podTime },
        });
    },
});
