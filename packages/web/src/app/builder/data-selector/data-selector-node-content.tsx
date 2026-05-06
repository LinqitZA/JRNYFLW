import { flowStructureUtil } from '@activepieces/shared';
import { t } from 'i18next';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useDrag } from 'react-dnd';

import { useApRipple } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { PieceIcon, stepsHooks } from '@/features/pieces';

import { useBuilderStateContext } from '../builder-hooks';
import {
  DND_TYPE_FIELD_PATH,
  FieldPathDndItem,
  inferValueType,
} from '../mapping/dnd-types';

import { DataSelectorTreeNode } from './type';

const ToggleIcon = ({ expanded }: { expanded: boolean }) => {
  const toggleIconSize = 15;
  return expanded ? (
    <ChevronUp height={toggleIconSize} width={toggleIconSize}></ChevronUp>
  ) : (
    <ChevronDown height={toggleIconSize} width={toggleIconSize}></ChevronDown>
  );
};

type DataSelectorNodeContentProps = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  depth: number;
  node: DataSelectorTreeNode;
};
const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (event.target) {
      (event.target as HTMLDivElement).click();
    }
  }
};

const DataSelectorNodeContent = ({
  node,
  expanded,
  setExpanded,
  depth,
}: DataSelectorNodeContentProps) => {
  const flowVersion = useBuilderStateContext((state) => state.flowVersion);
  const insertMention = useBuilderStateContext((state) => state.insertMention);

  const [ripple, rippleEvent] = useApRipple();
  const step =
    node.data.type === 'value'
      ? flowStructureUtil.getStep(node.data.propertyPath, flowVersion.trigger)
      : node.data.type === 'test'
      ? flowStructureUtil.getStep(node.data.stepName, flowVersion.trigger)
      : undefined;
  const stepMetadata = step
    ? stepsHooks.useStepMetadata({ step }).stepMetadata
    : undefined;
  const showInsertButton =
    node.data.type === 'value' && node.data.insertable && !node.isLoopStepNode;
  const showNodeValue = !node.children && node.data.type === 'value';
  const isDraggable =
    node.data.type === 'value' && node.data.insertable && !node.isLoopStepNode;
  const depthMultiplier = 23 / (1 + depth * 0.05);

  const dragItem: FieldPathDndItem | null =
    node.data.type === 'value' && node.data.insertable && !node.isLoopStepNode
      ? {
          type: DND_TYPE_FIELD_PATH,
          propertyPath: node.data.propertyPath,
          displayName: node.data.displayName,
          valueType: inferValueType(node.data.value),
        }
      : null;

  const dragItemPath = dragItem?.propertyPath;

  const [{ isDragging }, dragRef] = useDrag<
    FieldPathDndItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: DND_TYPE_FIELD_PATH,
      item: dragItem ?? undefined,
      canDrag: () => isDraggable,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [dragItemPath, isDraggable],
  );

  const composedRef = (el: HTMLDivElement | null) => {
    if (typeof ripple === 'function') {
      (ripple as (node: HTMLDivElement | null) => void)(el);
    } else if (ripple && typeof ripple === 'object' && 'current' in ripple) {
      (ripple as { current: HTMLDivElement | null }).current = el;
    }
    if (isDraggable) dragRef(el);
  };

  const draggablePropertyPath =
    node.data.type === 'value' ? node.data.propertyPath : undefined;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyPress}
      ref={composedRef}
      data-jrny-mapping-source={isDraggable ? draggablePropertyPath : undefined}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={(e) => {
        if (node.children && node.children.length > 0) {
          rippleEvent(e);
          setExpanded(!expanded);
        } else if (
          insertMention &&
          node.data.type === 'value' &&
          node.data.insertable
        ) {
          rippleEvent(e);
          insertMention(node.data.propertyPath);
        }
      }}
      className="w-full max-w-full select-none focus:outline-hidden hover:bg-accent dark:hover:bg-accent/20 focus:bg-accent focus:bg-opacity-75 cursor-pointer group"
    >
      <div className="grow  max-w-full flex items-center gap-2 min-h-[48px] pr-3 select-none">
        <div
          style={{
            minWidth: `${
              depth * depthMultiplier + (depth === 0 ? 0 : 12) + 18
            }px`,
          }}
        ></div>
        {isDraggable && (
          <GripVertical
            className="shrink-0 size-4 text-muted-foreground/40 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing"
            aria-hidden
          />
        )}
        {stepMetadata && (
          <div className="shrink-0">
            <PieceIcon
              displayName={stepMetadata.displayName}
              logoUrl={stepMetadata.logoUrl}
              showTooltip={false}
              border={false}
              size="sm"
            ></PieceIcon>
          </div>
        )}
        {node.data.type !== 'test' && (
          <div className=" truncate">{node.data.displayName}</div>
        )}

        {showNodeValue && (
          <>
            <div className="shrink-0">:</div>
            <div className="flex-1 text-primary truncate">
              {`${node.data.type === 'value' ? node.data.value : ''}`}
            </div>
          </>
        )}

        <div className="ml-auto flex shrink-0 gap-2 items-center">
          {showInsertButton && (
            <Button
              className="z-50 hover:opacity-100  opacity-0 p-0  group-hover:p-1  group-hover:opacity-100 focus:opacity-100"
              variant="basic"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (insertMention) {
                  insertMention(
                    node.data.type === 'value' ? node.data.propertyPath : '',
                  );
                }
              }}
            >
              {t('Insert')}
            </Button>
          )}
          {node.children && node.children.length > 0 && (
            <div className="shrink-0 pr-5">
              <ToggleIcon expanded={expanded}></ToggleIcon>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
DataSelectorNodeContent.displayName = 'DataSelectorNodeContent';
export { DataSelectorNodeContent };
