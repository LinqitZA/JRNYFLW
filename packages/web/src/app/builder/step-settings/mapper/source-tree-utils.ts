import { NormalizedFieldType } from '@activepieces/shared';

import { SourceNode } from './mapper-ui-types';

function inferType(value: unknown): NormalizedFieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildNodes(
  record: Record<string, unknown>,
  basePath: string,
): SourceNode[] {
  return Object.entries(record).map(([name, value]) => {
    const path = basePath ? `${basePath}.${name}` : name;
    const type = inferType(value);
    if (type === 'object' && isPlainObject(value)) {
      return { path, name, type, children: buildNodes(value, path) };
    }
    return { path, name, type };
  });
}

function buildSourceTree(sample: unknown): SourceNode[] {
  const row = Array.isArray(sample) ? sample[0] : sample;
  if (!isPlainObject(row)) return [];
  return buildNodes(row, '');
}

export const mapperSourceUtils = { buildSourceTree };
