import { useDrag } from 'react-dnd';

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
    <div
      ref={composedDragRef}
      data-jrny-mapping-source={node.path}
      style={{ opacity: isDragging ? 0.4 : 1, paddingLeft: `${depth * 16}px` }}
      className="flex items-center min-h-9 px-2 rounded-md select-none cursor-grab active:cursor-grabbing hover:bg-accent text-sm"
    >
      <span className="truncate">{node.name}</span>
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
        className="flex items-center min-h-9 px-2 text-sm font-medium text-muted-foreground select-none"
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
