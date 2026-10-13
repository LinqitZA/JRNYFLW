import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { jrnyAuth } from '../auth';
import { jrnyClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const courierResponse = createAction({
  auth: jrnyAuth,
  name: 'courier_response',
  displayName: 'Courier Response',
  description:
    'Report a courier booking, tracking update, POD or failure back to a JRNY dispatch note. Blank fields keep their current value. The courier status only moves forward: sending the same or an earlier status is recorded but not applied (applied: false), so re-sending is safe. Failed records the error without changing the status.',
  props: {
    dispatchNumber: Property.ShortText({
      displayName: 'Dispatch Number',
      description: 'JRNY dispatch note number, e.g. DN-000026 (the webhook\'s data.dispatchNumber).',
      required: true,
    }),
    courierStatus: Property.StaticDropdown({
      displayName: 'Courier Status',
      required: true,
      options: {
        options: [
          { label: 'Booked', value: 'booked' },
          { label: 'Manifested', value: 'manifested' },
          { label: 'Collected', value: 'collected' },
          { label: 'In Transit', value: 'in_transit' },
          { label: 'Delivered', value: 'delivered' },
          { label: 'Failed', value: 'failed' },
        ],
      },
    }),
    waybillNumber: Property.ShortText({
      displayName: 'Waybill Number',
      description: 'Max 50. Rejected (409) if another dispatch in the entity already uses it.',
      required: false,
    }),
    trackingUrl: Property.ShortText({ displayName: 'Tracking URL', description: 'Max 500.', required: false }),
    courierReference: Property.ShortText({ displayName: 'Courier Reference', description: 'Max 100.', required: false }),
    bookedAt: Property.ShortText({
      displayName: 'Booked At',
      description: 'ISO timestamp. JRNY uses the current time when Booked is sent without it.',
      required: false,
    }),
    manifestNumber: Property.ShortText({ displayName: 'Manifest Number', description: 'Max 50.', required: false }),
    manifestDate: Property.ShortText({ displayName: 'Manifest Date', description: 'YYYY-MM-DD.', required: false }),
    podSignedBy: Property.ShortText({ displayName: 'POD Signed By', description: 'Max 255.', required: false }),
    podSignedAt: Property.ShortText({ displayName: 'POD Signed At', description: 'ISO timestamp.', required: false }),
    podNotes: Property.LongText({ displayName: 'POD Notes', required: false }),
    statusAt: Property.ShortText({
      displayName: 'Status At',
      description: 'ISO timestamp of when this status happened at the courier, e.g. the POD signature time for Delivered.',
      required: false,
    }),
    hubCode: Property.ShortText({ displayName: 'Hub Code', description: 'The courier hub the booking went to. Max 20.', required: false }),
    courierWarning: Property.LongText({
      displayName: 'Courier Warning',
      description: 'A booking someone needs to look at, e.g. booked with hub UNK. A later Booked response without one clears it.',
      required: false,
    }),
    podUrl: Property.ShortText({ displayName: 'POD URL', description: 'http(s) link to the POD. Max 2000.', required: false }),
    grnNumber: Property.ShortText({
      displayName: 'GRN Number',
      description: "The customer's GRN, when the driver captured it. Max 60. JRNY never overwrites a GRN entered by hand.",
      required: false,
    }),
    errorMessage: Property.LongText({
      displayName: 'Error Message',
      description: 'For Failed. Stored on the dispatch note and shown to the JRNY user. "<Step>: <reason>" also gives JRNY the failed step.',
      required: false,
    }),
    failedStep: Property.ShortText({
      displayName: 'Failed Step',
      description: 'For Failed. The step that failed, max 60. Leave blank to let JRNY take it from the Error Message prefix.',
      required: false,
    }),
    onFailure: pieceTrace.onFailureProperty(),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
    return pieceTrace.run({
      onFailure: p.onFailure,
      secrets: jrnyClient.secretsOf(auth),
      work: async (trace) => {
        const body = {
          courierStatus: p.courierStatus,
          ...present('waybillNumber', p.waybillNumber),
          ...present('trackingUrl', p.trackingUrl),
          ...present('courierReference', p.courierReference),
          ...present('bookedAt', p.bookedAt),
          ...present('manifestNumber', p.manifestNumber),
          ...present('manifestDate', p.manifestDate),
          ...present('podSignedBy', p.podSignedBy),
          ...present('podSignedAt', p.podSignedAt),
          ...present('podNotes', p.podNotes),
          ...present('statusAt', p.statusAt),
          ...present('hubCode', p.hubCode),
          ...present('courierWarning', p.courierWarning),
          ...present('podUrl', p.podUrl),
          ...present('grnNumber', p.grnNumber),
          ...present('errorMessage', p.errorMessage),
          ...present('failedStep', p.failedStep),
        };
        const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/dispatch-notes/${encodeURIComponent(p.dispatchNumber.trim())}/courier-response`;
        return jrnyClient.callJrny({ trace, auth, method: HttpMethod.PATCH, path, body });
      },
    });
  },
});

// JRNY keeps the current value for any field left out, so blanks must be omitted rather than sent as empty strings.
function present(key: string, value: string | undefined): Record<string, string> {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? {} : { [key]: trimmed };
}
