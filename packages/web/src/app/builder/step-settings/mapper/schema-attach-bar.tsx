import { NormalizedSchema } from '@activepieces/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { runSchemaAdapter, SchemaAdapterId } from './schema-adapters';

export const SchemaAttachBar = ({
  adapterId,
  onSchema,
  disabled,
}: SchemaAttachBarProps) => {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onParse = () => {
    try {
      const schema = runSchemaAdapter({ id: adapterId, raw });
      setError(null);
      onSchema(schema);
    } catch {
      setError(t('Could not parse the schema'));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t('Paste a JSON sample')}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={onParse}
      >
        {t('Parse schema')}
      </Button>
      {error !== null && (
        <span className={cn('text-sm text-destructive')}>{error}</span>
      )}
    </div>
  );
};

type SchemaAttachBarProps = {
  adapterId: SchemaAdapterId;
  onAdapterIdChange: (id: SchemaAdapterId) => void;
  onSchema: (schema: NormalizedSchema) => void;
  disabled: boolean;
};
