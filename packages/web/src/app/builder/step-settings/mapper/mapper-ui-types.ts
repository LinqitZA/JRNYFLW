import { NormalizedFieldType } from '@activepieces/shared';

export type SourceNode = {
  path: string;
  name: string;
  type: NormalizedFieldType;
  children?: SourceNode[];
};

export type TargetSlot = {
  path: string;
  name: string;
  type: NormalizedFieldType;
  kind: 'scalar' | 'collection';
  collectionPath?: string;
  depth: number;
};
