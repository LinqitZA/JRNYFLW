import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { jrnyAuth } from '../auth';
import { callJrny } from '../client';

export const courierResponse = createAction({
  auth: jrnyAuth,
  name: 'courier_response',
  displayName: 'Courier Response',
  description:
    'Report a courier booking, tracking update, POD or failure back to a JRNY dispatch note. Blank fields keep their current value on the dispatch note. The dispatch must be ready_to_dispatch, dispatched or invoiced.',
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
    errorMessage: Property.LongText({
      displayName: 'Error Message',
      description: 'For Failed. JRNY includes it in the failure notification but does not store it on the dispatch note.',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const p = context.propsValue;
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
      ...present('errorMessage', p.errorMessage),
    };
    const path = `/api/v1/integration/entities/${encodeURIComponent(auth.entityId)}/dispatch-notes/${encodeURIComponent(p.dispatchNumber.trim())}/courier-response`;
    return callJrny(auth, HttpMethod.PATCH, path, body);
  },
});

// JRNY keeps the current value for any field left out, so blanks must be omitted rather than sent as empty strings.
function present(key: string, value: string | undefined): Record<string, string> {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? {} : { [key]: trimmed };
}
