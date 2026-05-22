// @vitest-environment jsdom
import { openapiAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/openapi-adapter';

const spec = JSON.stringify({
  openapi: '3.0.0',
  paths: {
    '/quotations': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  po_number: { type: 'string' },
                  lines: { type: 'array', items: { $ref: '#/components/schemas/Line' } },
                },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: { Line: { type: 'object', properties: { sku: { type: 'string' } } } } },
});

describe('openapiAdapter', () => {
  test('has id openapi', () => {
    expect(openapiAdapter.id).toBe('openapi');
  });

  test('extracts and converts the request body schema for an operation', () => {
    expect(openapiAdapter.parse({ raw: spec, ref: 'POST /quotations' })).toEqual({
      root: 'object',
      fields: [
        { name: 'po_number', type: 'string' },
        { name: 'lines', type: 'array', children: [{ name: 'sku', type: 'string' }] },
      ],
    });
  });

  test('is case-insensitive on the method', () => {
    expect(openapiAdapter.parse({ raw: spec, ref: 'post /quotations' }).root).toBe('object');
  });

  test('throws when ref is missing', () => {
    expect(() => openapiAdapter.parse({ raw: spec })).toThrow(/operation/i);
  });

  test('throws when the operation is not found', () => {
    expect(() => openapiAdapter.parse({ raw: spec, ref: 'GET /nope' })).toThrow(/not found/i);
  });
});
