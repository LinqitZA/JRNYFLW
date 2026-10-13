import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { pieceTrace } from '@jrnyflw/piece-trace';
import { aonPortalAuth } from '../auth';
import { aonPortalClient } from '../client';

// Read while the action is defined, so it must be declared before it.
const STATUSES: OrderStatus[] = ['processing', 'acknowledged', 'completed', 'cancelled', 'shipped', 'on_hold'];

export const listOrders = createAction({
    auth: aonPortalAuth,
    name: 'list_orders',
    displayName: 'List Orders',
    description: 'All portal orders with a status, every page fetched. Returns { orders, total }.',
    props: {
        status: Property.StaticDropdown<OrderStatus>({
            displayName: 'Status',
            required: false,
            defaultValue: 'processing',
            options: { options: STATUSES.map((value) => ({ label: value, value })) },
        }),
        onFailure: pieceTrace.onFailureProperty(),
    },
    async run(context) {
        const auth = context.auth.props;
        const status = context.propsValue.status ?? 'processing';
        return pieceTrace.run({
            onFailure: context.propsValue.onFailure,
            secrets: aonPortalClient.secretsOf(auth),
            work: async (trace) => {
                const orders: unknown[] = [];
                for (let pageNumber = 1; ; pageNumber++) {
                    const body = await aonPortalClient.call<unknown>({
                        trace,
                        auth,
                        method: HttpMethod.GET,
                        path: '/api/erp/orders',
                        query: { status, page: String(pageNumber), limit: String(PAGE_SIZE) },
                    });
                    if (!isOrderPage(body)) {
                        throw new Error('Unexpected response from the portal');
                    }
                    if (body.pagination.totalPages > MAX_PAGES) {
                        throw new Error(
                            `More than ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en-US')} orders with status ${status}; narrow the status or ask for a date filter`,
                        );
                    }
                    orders.push(...body.orders);
                    if (pageNumber >= body.pagination.totalPages) {
                        return { orders, total: body.pagination.total };
                    }
                }
            },
        });
    },
});

function isOrderPage(value: unknown): value is OrderPage {
    if (typeof value !== 'object' || value === null || !('orders' in value) || !('pagination' in value)) {
        return false;
    }
    const pagination: unknown = value.pagination;
    return (
        Array.isArray(value.orders) &&
        typeof pagination === 'object' &&
        pagination !== null &&
        'totalPages' in pagination &&
        typeof pagination.totalPages === 'number' &&
        'total' in pagination &&
        typeof pagination.total === 'number'
    );
}

const PAGE_SIZE = 50;
// Bounds a portal that keeps reporting more pages, so a flow step cannot loop forever.
const MAX_PAGES = 100;

type OrderStatus = 'processing' | 'acknowledged' | 'completed' | 'cancelled' | 'shipped' | 'on_hold';
type OrderPage = { orders: unknown[]; pagination: { total: number; totalPages: number } };
