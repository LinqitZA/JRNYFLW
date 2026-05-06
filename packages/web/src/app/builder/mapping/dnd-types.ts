export const DND_TYPE_FIELD_PATH = 'jrnyflw/field-path';

export type FieldPathDndItem = {
  type: typeof DND_TYPE_FIELD_PATH;
  propertyPath: string;
  displayName: string;
  valueType: FieldValueType;
};

export type FieldValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'unknown';

export const inferValueType = (value: unknown): FieldValueType => {
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
};

export const valueTypesCompatible = (
  source: FieldValueType,
  target: FieldValueType,
): boolean => {
  if (target === 'unknown' || source === 'unknown') return true;
  if (source === target) return true;
  if (target === 'string') return source !== 'array' && source !== 'object';
  if (target === 'number') return source === 'string';
  return false;
};
