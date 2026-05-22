import { NormalizedField, NormalizedFieldType, NormalizedSchema } from '@activepieces/shared';

import { SchemaAdapter } from './adapter-type';

function isObjectNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapType(propertyType: string | undefined): NormalizedFieldType {
  switch (propertyType) {
    case 'NUMBER':
      return 'number';
    case 'CHECKBOX':
      return 'boolean';
    case 'ARRAY':
      return 'array';
    case 'OBJECT':
    case 'JSON':
      return 'object';
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
    case 'DROPDOWN':
    case 'STATIC_DROPDOWN':
    case 'DATE_TIME':
    case 'SECRET_TEXT':
    case 'COLOR':
      return 'string';
    default:
      return 'unknown';
  }
}

function toField(name: string, node: Record<string, unknown>): NormalizedField {
  const type = mapType(node['type'] as string | undefined);
  if (type === 'array') {
    const nested = node['properties'];
    if (isObjectNode(nested)) {
      return { name, type, children: fromProperties(nested) };
    }
  }
  return { name, type };
}

function fromProperties(props: Record<string, unknown>): NormalizedField[] {
  return Object.entries(props).map(([name, value]) =>
    toField(name, isObjectNode(value) ? value : {}),
  );
}

function fromPropertyMap(props: Record<string, unknown>): NormalizedSchema {
  return { root: 'object', fields: fromProperties(props) };
}

export const pieceSchemaUtils = { fromPropertyMap };

export const pieceSchemaAdapter: SchemaAdapter = {
  id: 'piece_schema',
  parse: ({ raw }) => {
    let props: unknown;
    try {
      props = JSON.parse(raw);
    } catch {
      throw new Error('Invalid piece property map');
    }
    if (!isObjectNode(props)) {
      throw new Error('Piece property map must be an object');
    }
    return fromPropertyMap(props);
  },
};
