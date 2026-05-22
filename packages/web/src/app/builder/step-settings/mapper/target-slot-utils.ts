import { NormalizedField, NormalizedSchema } from '@activepieces/shared';

import { TargetSlot } from './mapper-ui-types';

function pushScalar(slots: TargetSlot[], field: NormalizedField, path: string, depth: number, collectionPath?: string): void {
  const slot: TargetSlot = { path, name: field.name, type: field.type, kind: 'scalar', depth };
  if (collectionPath) slot.collectionPath = collectionPath;
  slots.push(slot);
}

function walk(fields: NormalizedField[], basePath: string, depth: number, slots: TargetSlot[]): void {
  for (const field of fields) {
    const path = basePath ? `${basePath}.${field.name}` : field.name;
    if (field.type === 'array' && field.children && field.children.length > 0) {
      slots.push({ path, name: field.name, type: field.type, kind: 'collection', depth });
      for (const child of field.children) {
        pushScalar(slots, child, child.name, depth + 1, path);
      }
      continue;
    }
    if (field.type === 'object' && field.children && field.children.length > 0) {
      pushScalar(slots, field, path, depth);
      walk(field.children, path, depth + 1, slots);
      continue;
    }
    pushScalar(slots, field, path, depth);
  }
}

function deriveSlots(schema: NormalizedSchema): TargetSlot[] {
  const slots: TargetSlot[] = [];
  walk(schema.fields, '', 0, slots);
  return slots;
}

export const mapperTargetUtils = { deriveSlots };
