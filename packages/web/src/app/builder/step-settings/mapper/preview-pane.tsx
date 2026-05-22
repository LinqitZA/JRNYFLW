import { MappingSpec, mapperEngine, tryCatchSync } from '@activepieces/shared';
import { t } from 'i18next';

import { cn } from '@/lib/utils';

export const PreviewPane = ({ sample, spec }: PreviewPaneProps) => {
  const { data, error } = tryCatchSync(() =>
    mapperEngine.runMapping({ sourceData: sample, spec }),
  );
  if (error || !data) {
    return (
      <span className={cn('text-sm text-destructive')}>
        {error?.message ?? ''}
      </span>
    );
  }
  const { output, warnings } = data;
  return (
    <div className="flex flex-col gap-2">
      <pre
        className={cn('max-h-64 overflow-auto rounded-md border p-3 text-xs')}
      >
        {JSON.stringify(output, null, 2)}
      </pre>
      {warnings.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t('No warnings')}
        </span>
      ) : (
        <ul className="flex flex-col gap-1">
          {warnings.map((w, i) => (
            <li key={`${w.path}-${i}`} className={cn('text-xs text-amber-600')}>
              {w.path}: {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type PreviewPaneProps = {
  sample: unknown;
  spec: MappingSpec;
};
