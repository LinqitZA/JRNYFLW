/// <reference types="vitest/globals" />
import { aonPortal } from '../src';

test('the piece exposes List Orders, Acknowledge Order and Custom API Call', () => {
    expect(Object.keys(aonPortal.actions()).sort()).toEqual(['acknowledge_order', 'custom_api_call', 'list_orders']);
});
