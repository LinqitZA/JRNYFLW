import { MappingSpec } from '@activepieces/shared';
import { t } from 'i18next';
import { FunctionSquare, Unlink } from 'lucide-react';
import { useDrop } from 'react-dnd';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { DND_TYPE_FIELD_PATH, FieldPathDndItem } from '../../mapping/dnd-types';

import { mapperSpecUtils } from './mapper-spec-utils';
import { TargetSlot } from './mapper-ui-types';
import { TransformPicker } from './transform-picker';

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
  onChange: (next: MappingSpec) => void;
  disabled: boolean;
};

const TargetSlotRow = ({
  slot,
  spec,
  onChange,
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
        onChange(applyDrop({ spec, slot, sourcePath: item.propertyPath }));
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
      <div style={indentStyle}>
        <div className="flex items-center py-1 text-sm font-medium text-muted-foreground select-none">
          {slot.name}
        </div>
      </div>
    );
  }

  const boundSource = findBoundSource(spec, slot);
  const dataTarget = slot.collectionPath
    ? `${slot.collectionPath}.${slot.path}`
    : slot.path;
  const transforms = mapperSpecUtils.getTransforms(spec, {
    targetPath: slot.path,
    collectionPath: slot.collectionPath,
  });

  const onTransformsChange = (next: typeof transforms) => {
    onChange(
      mapperSpecUtils.setTransforms(spec, {
        targetPath: slot.path,
        collectionPath: slot.collectionPath,
        transforms: next,
      }),
    );
  };

  const onUnlink = () => {
    onChange(
      mapperSpecUtils.removeBinding(spec, {
        targetPath: slot.path,
        collectionPath: slot.collectionPath,
      }),
    );
  };

  return (
    <div style={indentStyle}>
      <div
        ref={composedDropRef}
        data-jrny-mapping-target={dataTarget}
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors select-none',
          {
            'ring-2 ring-primary ring-offset-2': isOver && canDrop,
            'ring-1 ring-primary/30': canDrop && !isOver,
          },
        )}
      >
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{slot.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {slot.type}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {boundSource ? (
            <span className="truncate text-xs text-primary">{boundSource}</span>
          ) : null}
          {transforms.map((tr) => (
            <Badge key={tr.id} variant="secondary">
              {tr.id}
            </Badge>
          ))}
          {boundSource ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  aria-label={t('Apply transforms')}
                >
                  <FunctionSquare />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end">
                <TransformPicker
                  selected={transforms}
                  onChange={onTransformsChange}
                  disabled={disabled}
                />
              </PopoverContent>
            </Popover>
          ) : null}
          {boundSource ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={onUnlink}
              aria-label={t('Remove mapping')}
            >
              <Unlink />
            </Button>
          ) : null}
        </div>
      </div>
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
    <>
      {slots.map((slot) => (
        <TargetSlotRow
          key={
            slot.collectionPath
              ? `${slot.collectionPath}.${slot.path}`
              : slot.path
          }
          slot={slot}
          spec={spec}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </>
  );
};

export { TargetSlotList };

export const mapperDropUtils = { applyDrop };

type ApplyDropParams = {
  spec: MappingSpec;
  slot: TargetSlot;
  sourcePath: string;
};
