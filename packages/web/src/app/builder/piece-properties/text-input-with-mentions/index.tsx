import { flowStructureUtil, isNil } from '@activepieces/shared';
import { Extensions } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { History } from '@tiptap/extension-history';
import { MentionNodeAttrs, Mention } from '@tiptap/extension-mention';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Text } from '@tiptap/extension-text';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useDrop } from 'react-dnd';

import { inputClass } from '@/components/ui/input';
import { stepsHooks } from '@/features/pieces';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../../builder-hooks';
import { DND_TYPE_FIELD_PATH, FieldPathDndItem } from '../../mapping/dnd-types';

import { textMentionUtils } from './text-input-utils';

type TextInputWithMentionsProps = {
  className?: string;
  initialValue?: unknown;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  enableMarkdown?: boolean;
};

function getExtensions({
  enableMarkdown,
  placeholder,
}: {
  placeholder?: string;
  enableMarkdown?: boolean;
}): Extensions {
  const baseExtensions = [
    Placeholder.configure({
      placeholder: placeholder,
      emptyNodeClass: 'before:text-muted-foreground opacity-75',
    }),
    Mention.configure({
      suggestion: {
        char: '',
      },
      deleteTriggerWithBackspace: true,
      renderHTML({ node }) {
        const mentionAttrs = node.attrs as unknown as MentionNodeAttrs;
        return textMentionUtils.generateMentionHtmlElement(mentionAttrs);
      },
    }),
  ];

  if (enableMarkdown) {
    return [
      ...baseExtensions,
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ] as Extensions;
  }

  return [
    ...baseExtensions,
    Document,
    History,
    HardBreak,
    Text,
    Paragraph.configure({
      HTMLAttributes: {},
    }),
  ] as Extensions;
}

function convertToText(value: unknown): string {
  if (isNil(value)) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return JSON.stringify(value);
}

export const TextInputWithMentions = ({
  className,
  initialValue,
  onChange,
  disabled,
  placeholder,
  enableMarkdown,
}: TextInputWithMentionsProps) => {
  const steps = useBuilderStateContext((state) =>
    flowStructureUtil.getAllSteps(state.flowVersion.trigger),
  );
  const stepsMetadata = stepsHooks
    .useStepsMetadata(steps)
    .map(({ data: metadata }, index) => {
      if (metadata) {
        return {
          ...metadata,
          stepDisplayName: steps[index].displayName,
        };
      }
      return undefined;
    });

  const setInsertMentionHandler = useBuilderStateContext(
    (state) => state.setInsertMentionHandler,
  );

  const insertMention = (propertyPath: string) => {
    const mentionNode = textMentionUtils.createMentionNodeFromText(
      `{{${propertyPath}}}`,
      steps,
      stepsMetadata,
    );
    editor?.chain().focus().insertContent(mentionNode).run();
  };

  const editor = useEditor({
    editable: !disabled,
    extensions: getExtensions({ placeholder, enableMarkdown }),
    content: {
      type: 'doc',
      content: textMentionUtils.convertTextToTipTapJsonContent(
        convertToText(initialValue),
        steps,
        stepsMetadata,
      ),
    },
    editorProps: {
      attributes: {
        class: cn(
          className ?? cn(inputClass, 'py-2 h-[unset] block   min-h-9  '),
          textMentionUtils.inputWithMentionsCssClass,
          {
            'cursor-not-allowed opacity-50': disabled,
          },
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const editorContent = editor.getJSON();
      const textResult =
        textMentionUtils.convertTiptapJsonToText(editorContent);
      if (onChange) {
        onChange(textResult);
      }
    },
    onFocus: () => {
      setInsertMentionHandler(insertMention);
    },
  });

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
        editor?.commands.clearContent();
        insertMention(item.propertyPath);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [editor, disabled],
  );

  if (!editor) {
    return null;
  }

  const wrapperRef = (el: HTMLDivElement | null) => {
    dropRef(el);
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('w-full rounded-md transition-colors', {
        'ring-2 ring-primary ring-offset-2': isOver && canDrop,
        'ring-1 ring-primary/30': canDrop && !isOver,
      })}
      data-jrny-mapping-target
    >
      <EditorContent editor={editor} />
    </div>
  );
};
