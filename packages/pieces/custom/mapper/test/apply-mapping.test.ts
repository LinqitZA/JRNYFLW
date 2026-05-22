/// <reference types="vitest/globals" />

import { createMockActionContext } from '@activepieces/pieces-framework'
import { applyMapping } from '../src/lib/actions/apply-mapping'

describe('applyMapping action', () => {
  test('groups Excel rows into quotations and returns warnings array', async () => {
    const mappingSpec = {
      specVersion: 1,
      mode: 'auto',
      groupBy: ['CustomerPONumber'],
      fields: [
        { target: 'po_number', binding: { kind: 'header', source: 'CustomerPONumber' } },
        {
          target: 'lines',
          binding: {
            kind: 'line_collection',
            items: [
              { target: 'product_code', binding: { kind: 'row', source: 'SKU' } },
              { target: 'quantity', binding: { kind: 'row', source: 'Qty', transforms: [{ id: 'parse_number' }] } },
            ],
          },
        },
      ],
    }
    const sourceData = [
      { CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' },
      { CustomerPONumber: 'PO-1', SKU: 'B', Qty: '3' },
      { CustomerPONumber: 'PO-2', SKU: 'C', Qty: '1' },
    ]
    const ctx = createMockActionContext({ propsValue: { sourceData, mappingSpec } })
    const result = await applyMapping.run(ctx)
    expect(result).toEqual({
      output: [
        { po_number: 'PO-1', lines: [{ product_code: 'A', quantity: 2 }, { product_code: 'B', quantity: 3 }] },
        { po_number: 'PO-2', lines: [{ product_code: 'C', quantity: 1 }] },
      ],
      warnings: [],
    })
  })

  test('throws on an invalid mapping spec', async () => {
    const ctx = createMockActionContext({
      propsValue: { sourceData: {}, mappingSpec: { specVersion: 1, fields: [{ target: 'x', binding: { kind: 'bogus' } }] } },
    })
    await expect(applyMapping.run(ctx)).rejects.toThrow()
  })
})
