import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { shopriteAuth } from '../auth';
import { shopriteClient } from '../client';
import { pieceTrace } from '@jrnyflw/piece-trace';

export const acknowledgeOrders = createAction({
    auth: shopriteAuth,
    name: 'acknowledge_orders',
    displayName: 'Acknowledge Orders',
    description:
        'Tells Shoprite these orders are received, so Download Orders stops returning them. Only acknowledge orders that are safely in JRNY, and never while another system is still reading the same Shoprite account.',
    props: {
        orderNumbers: Property.LongText({
            displayName: 'Order Numbers',
            description: 'Shoprite order numbers separated by commas, spaces or new lines, e.g. {{step_1.output.orderNumbers}} or one order\'s number.',
            required: true,
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: shopriteClient.secretsOf(auth),
            work: async (trace) => {
                const orderNumbers = parseOrderNumbers(context.propsValue.orderNumbers);
                const response = await shopriteClient.call<unknown>({
                    trace,
                    auth,
                    method: HttpMethod.PUT,
                    path: '/api/VendorOrder',
                    query: { action: 'Acknowledge' },
                    headers: { 'Content-Type': 'application/xml' },
                    body: toArrayOfLong(orderNumbers),
                });
                return { acknowledged: orderNumbers, count: orderNumbers.length, response };
            },
        });
    },
});

function parseOrderNumbers(value: unknown): string[] {
    const numbers = [...new Set(String(value ?? '').split(/[\s,;]+/).filter((part) => part !== ''))];
    const invalid = numbers.find((part) => !/^\d+$/.test(part));
    if (invalid !== undefined) {
        throw new Error(`Not a Shoprite order number: ${invalid}`);
    }
    if (numbers.length === 0) {
        throw new Error('Order Numbers needs at least one order number');
    }
    return numbers;
}

// Shoprite's endpoint is .NET and takes the order numbers as a serialised List<long>, in the same layout the previous integration sent.
function toArrayOfLong(orderNumbers: string[]): string {
    const items = orderNumbers.map((orderNumber) => `  <long>${orderNumber}</long>`).join('\r\n');
    return `<ArrayOfLong xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r\n${items}\r\n</ArrayOfLong>`;
}
