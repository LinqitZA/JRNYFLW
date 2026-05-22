import { SchemaAdapter } from './adapter-type';
import { jsonSchemaConverter } from './json-schema-converter';

type JsonNode = Record<string, unknown>;

function isObjectNode(value: unknown): value is JsonNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequestBodySchema(spec: JsonNode, method: string, path: string): unknown {
  const paths = spec['paths'];
  if (!isObjectNode(paths)) throw new Error('OpenAPI spec has no paths');
  const pathItem = paths[path];
  if (!isObjectNode(pathItem)) throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`);
  const operation = pathItem[method];
  if (!isObjectNode(operation)) throw new Error(`Operation not found: ${method.toUpperCase()} ${path}`);
  const requestBody = operation['requestBody'];
  if (!isObjectNode(requestBody)) throw new Error(`Operation has no request body: ${method.toUpperCase()} ${path}`);
  const content = requestBody['content'];
  if (!isObjectNode(content)) throw new Error('Request body has no content');
  const json = content['application/json'];
  if (!isObjectNode(json)) throw new Error('Request body has no application/json content');
  return json['schema'];
}

export const openapiAdapter: SchemaAdapter = {
  id: 'openapi',
  parse: ({ raw, ref }) => {
    if (!ref || ref.trim() === '') {
      throw new Error('OpenAPI adapter requires an operation ref like "POST /quotations"');
    }
    let spec: unknown;
    try {
      spec = JSON.parse(raw);
    } catch {
      throw new Error('Invalid OpenAPI document');
    }
    if (!isObjectNode(spec)) {
      throw new Error('Invalid OpenAPI document');
    }
    const [rawMethod, ...rest] = ref.trim().split(/\s+/);
    const path = rest.join(' ');
    if (!rawMethod || path === '') {
      throw new Error('Operation ref must be "<METHOD> <path>"');
    }
    const schema = getRequestBodySchema(spec, rawMethod.toLowerCase(), path);
    return jsonSchemaConverter.convert({ schema, root: spec });
  },
};
