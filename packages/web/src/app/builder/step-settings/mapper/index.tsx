import { flowStructureUtil } from '@activepieces/shared';
import { t } from 'i18next';
import { useFormContext } from 'react-hook-form';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useStepSettingsContext } from '@/app/builder/step-settings/step-settings-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { mapperSpecUtils } from './mapper-spec-utils';

const extractSourceStepName = (sourceData: unknown): string | null => {
  if (typeof sourceData !== 'string') {
    return null;
  }
  const match = sourceData.match(/^\{\{steps\.([^.}]+)\.output\}\}$/);
  return match ? match[1] : null;
};

export const MapperStepConfig = ({ readonly }: MapperStepConfigProps) => {
  const form = useFormContext();
  const { selectedStep } = useStepSettingsContext();
  const outputSampleData = useBuilderStateContext(
    (state) => state.outputSampleData,
  );
  const flowVersion = useBuilderStateContext((state) => state.flowVersion);

  const priorSteps = flowStructureUtil.findPathToStep(
    flowVersion.trigger,
    selectedStep.name,
  );

  const sourceData: unknown = form.watch(SOURCE_DATA_FIELD);
  const sourceStepName = extractSourceStepName(sourceData);
  const sample = sourceStepName ? outputSampleData[sourceStepName] : undefined;

  const onSourceStepChange = (stepName: string) => {
    form.setValue(SOURCE_DATA_FIELD, `{{steps.${stepName}.output}}`);
    if (!form.getValues(MAPPING_SPEC_FIELD)) {
      form.setValue(MAPPING_SPEC_FIELD, mapperSpecUtils.createEmptySpec());
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Source step')}</span>
        <Select
          disabled={readonly}
          value={sourceStepName ?? undefined}
          onValueChange={onSourceStepChange}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('Select a source step')} />
          </SelectTrigger>
          <SelectContent>
            {priorSteps.map((step) => (
              <SelectItem key={step.name} value={step.name}>
                {step.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Target schema')}</span>
        <div
          className={cn('rounded-md border p-3 text-sm text-muted-foreground')}
        >
          {t('Attach a target schema to begin mapping')}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Preview')}</span>
        <div
          className={cn('rounded-md border p-3 text-sm text-muted-foreground')}
        >
          {sample === undefined
            ? t('No source data yet. Test the source step to load a sample.')
            : t('Attach a target schema to begin mapping')}
        </div>
      </div>
    </div>
  );
};

const SOURCE_DATA_FIELD = 'settings.input.sourceData';
const MAPPING_SPEC_FIELD = 'settings.input.mappingSpec';

type MapperStepConfigProps = {
  readonly: boolean;
};
