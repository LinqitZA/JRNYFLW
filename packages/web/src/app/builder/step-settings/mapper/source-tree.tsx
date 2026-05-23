import { GripVertical } from 'lucide-react';
import { useDrag } from 'react-dnd';

import { cn } from '@/lib/utils';

import { DND_TYPE_FIELD_PATH, FieldPathDndItem } from '../../mapping/dnd-types';

import { SourceNode } from './mapper-ui-types';

type SourceLeafProps = {
  node: SourceNode;
  depth: number;
  disabled: boolean;
};

const SourceLeaf = ({ node, depth, disabled }: SourceLeafProps) => {
  const [{ isDragging }, dragRef] = useDrag<
    FieldPathDndItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: DND_TYPE_FIELD_PATH,
      item: {
        type: DND_TYPE_FIELD_PATH,
        propertyPath: node.path,
        displayName: node.name,
        valueType: node.type,
      },
      canDrag: () => !disabled,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [node.path, disabled],
  );

  const composedDragRef = (el: HTMLDivElement | null) => {
    dragRef(el);
  };

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <div
        ref={composedDragRef}
        data-jrny-mapping-source={node.path}
        style={{ opacity: isDragging ? 0.4 : 1 }}
        className={cn(
          'flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm cursor-grab hover:bg-muted active:cursor-grabbing select-none',
        )}
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </div>
    </div>
  );
};

type SourceTreeNodeProps = {
  node: SourceNode;
  depth: number;
  disabled: boolean;
};

const SourceTreeNode = ({ node, depth, disabled }: SourceTreeNodeProps) => {
  const hasChildren = !!node.children && node.children.length > 0;

  if (!hasChildren) {
    return <SourceLeaf node={node} depth={depth} disabled={disabled} />;
  }

  return (
    <div className="flex flex-col">
      <div
        style={{ paddingLeft: `${depth * 16}px` }}
        className="flex items-center py-1 text-sm font-medium select-none"
      >
        {node.name}
      </div>
      {node.children?.map((child) => (
        <SourceTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

type SourceTreeProps = {
  nodes: SourceNode[];
  disabled: boolean;
};

const SourceTree = ({ nodes, disabled }: SourceTreeProps) => {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => (
        <SourceTreeNode
          key={node.path}
          node={node}
          depth={0}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export { SourceTree };
