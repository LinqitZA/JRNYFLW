import {
  Binding,
  FieldMapping,
  LineCollectionBinding,
  MapperMode,
  MappingSpec,
  TransformRef,
} from '@activepieces/shared';

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

type SetTransformsParams = {
  targetPath: string;
  collectionPath?: string;
  transforms: TransformRef[];
};

function createEmptySpec(): MappingSpec {
  return { specVersion: 1, mode: 'auto', fields: [] };
}

function isLineCollection(binding: Binding): binding is LineCollectionBinding {
  return binding.kind === 'line_collection';
}

function scalarBinding(
  kind: 'header' | 'row',
  sourcePath: string,
  transforms?: TransformRef[],
): Binding {
  return transforms && transforms.length > 0
    ? { kind, source: sourcePath, transforms }
    : { kind, source: sourcePath };
}

function upsertField(
  fields: FieldMapping[],
  target: string,
  binding: Binding,
): FieldMapping[] {
  const next = fields.filter((f) => f.target !== target);
  next.push({ target, binding });
  return next;
}

function setBinding(spec: MappingSpec, params: SetBindingParams): MappingSpec {
  const { targetPath, sourcePath, collectionPath, transforms } = params;
  if (!collectionPath) {
    return {
      ...spec,
      fields: upsertField(
        spec.fields,
        targetPath,
        scalarBinding('header', sourcePath, transforms),
      ),
    };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  const existingItems =
    existing && isLineCollection(existing.binding)
      ? existing.binding.items
      : [];
  const items = upsertField(
    existingItems,
    targetPath,
    scalarBinding('row', sourcePath, transforms),
  );
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return {
    ...spec,
    fields: upsertField(spec.fields, collectionPath, collection),
  };
}

function setMode(spec: MappingSpec, mode: MapperMode): MappingSpec {
  return { ...spec, mode };
}

function setGroupBy(spec: MappingSpec, keys: string[]): MappingSpec {
  if (keys.length === 0) {
    const { groupBy: _groupBy, ...rest } = spec;
    return rest as MappingSpec;
  }
  return { ...spec, groupBy: keys };
}

function withTransforms(binding: Binding, transforms: TransformRef[]): Binding {
  if (binding.kind === 'line_collection') return binding;
  if (transforms.length === 0) {
    return { kind: binding.kind, source: binding.source };
  }
  return { kind: binding.kind, source: binding.source, transforms };
}

function setTransforms(
  spec: MappingSpec,
  params: SetTransformsParams,
): MappingSpec {
  const { targetPath, collectionPath, transforms } = params;
  if (!collectionPath) {
    const fields = spec.fields.map((f) =>
      f.target === targetPath
        ? { target: f.target, binding: withTransforms(f.binding, transforms) }
        : f,
    );
    return { ...spec, fields };
  }
  const fields = spec.fields.map((f) => {
    if (f.target !== collectionPath || f.binding.kind !== 'line_collection')
      return f;
    const items = f.binding.items.map((i) =>
      i.target === targetPath
        ? { target: i.target, binding: withTransforms(i.binding, transforms) }
        : i,
    );
    return {
      target: f.target,
      binding: { kind: 'line_collection' as const, items },
    };
  });
  return { ...spec, fields };
}

function removeBinding(
  spec: MappingSpec,
  params: RemoveBindingParams,
): MappingSpec {
  const { targetPath, collectionPath } = params;
  if (!collectionPath) {
    return {
      ...spec,
      fields: spec.fields.filter((f) => f.target !== targetPath),
    };
  }
  const existing = spec.fields.find((f) => f.target === collectionPath);
  if (!existing || !isLineCollection(existing.binding)) return spec;
  const items = existing.binding.items.filter((i) => i.target !== targetPath);
  if (items.length === 0) {
    return {
      ...spec,
      fields: spec.fields.filter((f) => f.target !== collectionPath),
    };
  }
  const collection: LineCollectionBinding = { kind: 'line_collection', items };
  return {
    ...spec,
    fields: upsertField(spec.fields, collectionPath, collection),
  };
}

export const mapperSpecUtils = {
  createEmptySpec,
  setBinding,
  removeBinding,
  setMode,
  setGroupBy,
  setTransforms,
};
