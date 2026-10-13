import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { tryCatch } from '@activepieces/shared';
import { nucleusAuth } from '../auth';
import { nucleusClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { nucleusPodStatus } from '../pod-status';

export const getPodBulkExtra = createAction({
    auth: nucleusAuth,
    name: 'get_pod_bulk_extra',
    displayName: 'Get PODs Extra (Bulk)',
    description:
        'Delivery status for one or more waybills (GetPODInformation_Bulk_Extra): one record per waybill with POD, manifest date and links, plus the waybills Nucleus does not know in notFound.',
    props: {
        waybillNumbers: Property.ShortText({ displayName: 'Waybill Numbers', description: 'Separated by commas, spaces or new lines.', required: true }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: nucleusClient.secretsOf(auth),
            work: async (trace) => {
                const requested = nucleusPodStatus.parseWaybillList(context.propsValue.waybillNumbers);
                if (requested.length === 0) {
                    throw new Error('Provide at least one waybill number');
                }
                const { data: body, error } = await tryCatch(() =>
                    nucleusClient.call({
                        trace,
                        auth,
                        store: context.store,
                        method: HttpMethod.GET,
                        path: 'GetPODInformation_Bulk_Extra',
                        query: { waybillnumbers: requested.join(',') },
                    }),
                );
                if (error) {
                    // Nucleus answers with an error row only when none of the waybills exist; a partly unknown list just omits them.
                    if (error instanceof Error && NONE_EXIST.test(error.message)) {
                        return { waybills: [], notFound: requested };
                    }
                    throw error;
                }
                return nucleusPodStatus.toPodStatuses({ requested, rows: nucleusPodStatus.rowsOf(body), links: auth });
            },
        });
    },
});

const NONE_EXIST = /Waybill\/s - Does not Exist/i;
