import { Binding, FieldMapping, LineCollectionBinding, MappingSpec, TransformRef } from '@activepieces/shared';

type SetBindingParams = {
  targetPath: string;
  sourcePath: string;
  collectionPath?: string;
  transforms?: TransformRef[];
};

type RemoveBindingParams = {
  targetPath: string;
  collectionPath?: string;
};

function createEmptySpec(): MappingSpec {
  return { specVersion: 1, mode: 'auto', fields: [] };
}

function isLineCollection(binding: Binding): binding is LineCollectionBinding {
  return binding.kind === 'line_collection';
}

function scalarBinding(kind: 'header' | 'row', sourcePath: string, transforms?: TransformRef[]): Binding {
  return transforms && transforms.length > 0
    ? { kind, source: sourcePath, transforms }
    : { kind, source: sourcePath };
}

function upsertField(fields: FieldMapping[], target: string, binding: Binding): FieldMapping[] {
  const next = fields.filter((f) => f.target !== target);
  next.push({ target, binding });
  return next;
}

function setBinding(spec: MappingSpec, params: SetBindingParams): MappingSpec {
  const { targetPath, sourcePath, collectionPath, transforms } = params;
  if (!collectionPath) {
    return { ...spec, fields: upsertField(spec.fields, targetPath, scalarBinding('header', sourcePath, transforms)) };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  const existingItems = existing && isLineCollection(existing.binding) ? existing.binding.items : [];
  const items = upsertField(existingItems, targetPath, scalarBinding('row', sourcePath, transforms));
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return { ...spec, fields: upsertField(spec.fields, collectionPath, collection) };
}

function removeBinding(spec: MappingSpec, params: RemoveBindingParams): MappingSpec {
  const { targetPath, collectionPath } = params;
  if (!collectionPath) {
    return { ...spec, fields: spec.fields.filter((f) => f.target !== targetPath) };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  if (!existing || !isLineCollection(existing.binding)) return spec;
  const items = existing.binding.items.filter((i) => i.target !== targetPath);
  if (items.length === 0) {
    return { ...spec, fields: spec.fields.filter((f) => f.target !== collectionPath) };
  }
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return { ...spec, fields: upsertField(spec.fields, collectionPath, collection) };
}

export const mapperSpecUtils = { createEmptySpec, setBinding, removeBinding };
