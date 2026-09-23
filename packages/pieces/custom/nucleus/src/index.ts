import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { nucleusAuth } from './lib/auth';
import { createWaybill } from './lib/actions/create-waybill';
import { createWaybillImportHeader } from './lib/actions/create-waybill-import-header';
import { createWaybillImportDimsAndDetail } from './lib/actions/create-waybill-import-dims-and-detail';
import { getTrackingByAccnum } from './lib/actions/get-tracking-by-accnum';
import { getPodBulk } from './lib/actions/get-pod-bulk';
import { getLabel } from './lib/actions/get-label';
import { getHubCode } from './lib/actions/get-hub-code';
import { getTracking } from './lib/actions/get-tracking';
import { createTracking } from './lib/actions/create-tracking';
import { getPodBulkExtra } from './lib/actions/get-pod-bulk-extra';
import { createVerbalPod } from './lib/actions/create-verbal-pod';
import { createPodImage } from './lib/actions/create-pod-image';
import { customApiCall } from './lib/actions/custom-api-call';

export const nucleus = createPiece({
    displayName: 'Nucleus',
    description: 'Nucleus (Winfreight FMS) courier — create waybills, track shipments, fetch PODs and labels.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/webhook.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.SALES_AND_CRM],
    auth: nucleusAuth,
    actions: [
        getHubCode,
        createWaybill,
        createWaybillImportHeader,
        createWaybillImportDimsAndDetail,
        getTracking,
        getTrackingByAccnum,
        createTracking,
        getPodBulk,
        getPodBulkExtra,
        createVerbalPod,
        createPodImage,
        getLabel,
        customApiCall,
    ],
    triggers: [],
});
