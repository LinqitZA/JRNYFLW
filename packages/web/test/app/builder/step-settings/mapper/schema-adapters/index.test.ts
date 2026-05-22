// @vitest-environment jsdom
import { schemaAdapters, runSchemaAdapter } from '@/app/builder/step-settings/mapper/schema-adapters/index';

describe('schemaAdapters registry', () => {
  test('registers all six adapters by id', () => {
    expect(Object.keys(schemaAdapters).sort()).toEqual(
      ['csv', 'html_table', 'json_sample', 'json_schema', 'openapi', 'xml'].sort(),
    );
  });

  test('runSchemaAdapter dispatches by id', () => {
    const schema = runSchemaAdapter({ id: 'json_sample', raw: '{"a":1}' });
    expect(schema).toEqual({ root: 'object', fields: [{ name: 'a', type: 'number' }] });
  });

  test('runSchemaAdapter forwards ref to the openapi adapter', () => {
    const raw = JSON.stringify({
      paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } } } } } } } } },
    });
    expect(runSchemaAdapter({ id: 'openapi', raw, ref: 'POST /x' })).toEqual({
      root: 'object',
      fields: [{ name: 'a', type: 'string' }],
    });
  });

  test('runSchemaAdapter throws on an unknown id', () => {
    // @ts-expect-error testing the runtime guard with an invalid id
    expect(() => runSchemaAdapter({ id: 'nope', raw: '{}' })).toThrow(/adapter/i);
  });
});
