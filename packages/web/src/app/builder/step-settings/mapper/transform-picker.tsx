import { TransformRef, transformRegistry } from '@activepieces/shared';
import { t } from 'i18next';

import { cn } from '@/lib/utils';

export function TransformPicker({
  selected,
  onChange,
  disabled,
}: TransformPickerProps) {
  const availableIds = Object.keys(transformRegistry);
  const isSelected = (id: string) => selected.some((tr) => tr.id === id);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(
      isSelected(id)
        ? selected.filter((tr) => tr.id !== id)
        : [...selected, { id }],
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{t('Transforms')}</span>
      {availableIds.map((id) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => toggle(id)}
          className={cn(
            'flex items-center justify-between rounded px-2 py-1 text-left text-sm',
            isSelected(id) ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
          )}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

type TransformPickerProps = {
  selected: TransformRef[];
  onChange: (transforms: TransformRef[]) => void;
  disabled: boolean;
};
