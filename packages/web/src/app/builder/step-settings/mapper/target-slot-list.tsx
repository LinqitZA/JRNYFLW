import { MappingSpec } from '@activepieces/shared';
import { useDrop } from 'react-dnd';

import { cn } from '@/lib/utils';

import { DND_TYPE_FIELD_PATH, FieldPathDndItem } from '../../mapping/dnd-types';

import { mapperSpecUtils } from './mapper-spec-utils';
import { TargetSlot } from './mapper-ui-types';

function applyDrop({ spec, slot, sourcePath }: ApplyDropParams): MappingSpec {
  return mapperSpecUtils.setBinding(spec, {
    targetPath: slot.path,
    sourcePath,
    collectionPath: slot.collectionPath,
  });
}

function findBoundSource(
  spec: MappingSpec,
  slot: TargetSlot,
): string | undefined {
  if (!slot.collectionPath) {
    const field = spec.fields.find((f) => f.target === slot.path);
    if (field && field.binding.kind !== 'line_collection') {
      return field.binding.source;
    }
    return undefined;
  }
  const collection = spec.fields.find((f) => f.target === slot.collectionPath);
  if (!collection || collection.binding.kind !== 'line_collection') {
    return undefined;
  }
  const item = collection.binding.items.find((i) => i.target === slot.path);
  if (item && item.binding.kind !== 'line_collection') {
    return item.binding.source;
  }
  return undefined;
}

type TargetSlotRowProps = {
  slot: TargetSlot;
  spec: MappingSpec;
  onBind: (next: MappingSpec) => void;
  disabled: boolean;
};

const TargetSlotRow = ({
  slot,
  spec,
  onBind,
  disabled,
}: TargetSlotRowProps) => {
  const [{ isOver, canDrop }, dropRef] = useDrop<
    FieldPathDndItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >(
    () => ({
      accept: DND_TYPE_FIELD_PATH,
      canDrop: () => !disabled,
      drop: (item) => {
        if (disabled) return;
        onBind(applyDrop({ spec, slot, sourcePath: item.propertyPath }));
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [spec, slot, disabled],
  );

  const composedDropRef = (el: HTMLDivElement | null) => {
    dropRef(el);
  };

  const indentStyle = { paddingLeft: `${slot.depth * 16}px` };

  if (slot.kind === 'collection') {
    return (
      <div
        style={indentStyle}
        className="flex items-center min-h-9 px-2 text-sm font-medium text-muted-foreground select-none"
      >
        {slot.name}
      </div>
    );
  }

  const boundSource = findBoundSource(spec, slot);
  const dataTarget = slot.collectionPath
    ? `${slot.collectionPath}.${slot.path}`
    : slot.path;

  return (
    <div
      ref={composedDropRef}
      data-jrny-mapping-target={dataTarget}
      style={indentStyle}
      className={cn(
        'flex items-center justify-between gap-2 min-h-9 px-2 rounded-md transition-colors select-none',
        {
          'ring-2 ring-primary ring-offset-2': isOver && canDrop,
          'ring-1 ring-primary/30': canDrop && !isOver,
        },
      )}
    >
      <span className="truncate text-sm">{slot.name}</span>
      {boundSource ? (
        <span className="truncate text-xs text-primary">{boundSource}</span>
      ) : null}
    </div>
  );
};

type TargetSlotListProps = {
  slots: TargetSlot[];
  spec: MappingSpec;
  onChange: (next: MappingSpec) => void;
  disabled: boolean;
};

const TargetSlotList = ({
  slots,
  spec,
  onChange,
  disabled,
}: TargetSlotListProps) => {
  return (
    <div className="flex flex-col gap-1">
      {slots.map((slot) => (
        <TargetSlotRow
          key={
            slot.collectionPath
              ? `${slot.collectionPath}.${slot.path}`
              : slot.path
          }
          slot={slot}
          spec={spec}
          onBind={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export { TargetSlotList };

export const mapperDropUtils = { applyDrop };

type ApplyDropParams = {
  spec: MappingSpec;
  slot: TargetSlot;
  sourcePath: string;
};
