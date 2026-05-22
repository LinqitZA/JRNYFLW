import {
  flowStructureUtil,
  MappingSpec,
  NormalizedSchema,
} from '@activepieces/shared';
import { t } from 'i18next';
import { useRef, useState } from 'react';
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

import { BindLineOverlay } from './bind-line-overlay';
import { mapperSpecUtils } from './mapper-spec-utils';
import { PreviewPane } from './preview-pane';
import { SchemaAdapterId } from './schema-adapters';
import { SchemaAttachBar } from './schema-attach-bar';
import { SourceTree } from './source-tree';
import { mapperSourceUtils } from './source-tree-utils';
import { TargetSlotList } from './target-slot-list';
import { mapperTargetUtils } from './target-slot-utils';

const extractSourceStepName = (sourceData: unknown): string | null => {
  if (typeof sourceData !== 'string') {
    return null;
  }
  const match = sourceData.match(/^\{\{steps\.([^.}]+)\.output\}\}$/);
  return match ? match[1] : null;
};

const isMappingSpec = (value: unknown): value is MappingSpec => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'specVersion' in value &&
    value.specVersion === 1 &&
    'fields' in value &&
    Array.isArray(value.fields)
  );
};

const toSpec = (value: unknown): MappingSpec => {
  return isMappingSpec(value) ? value : mapperSpecUtils.createEmptySpec();
};

const derivePairs = (spec: MappingSpec): BindPair[] => {
  const pairs: BindPair[] = [];
  for (const field of spec.fields) {
    if (field.binding.kind === 'line_collection') {
      for (const item of field.binding.items) {
        if (item.binding.kind === 'line_collection') continue;
        pairs.push({
          sourcePath: item.binding.source,
          targetPath: `${field.target}.${item.target}`,
          status: 'valid',
        });
      }
      continue;
    }
    pairs.push({
      sourcePath: field.binding.source,
      targetPath: field.target,
      status: 'valid',
    });
  }
  return pairs;
};

export const MapperStepConfig = ({ readonly }: MapperStepConfigProps) => {
  const form = useFormContext();
  const { selectedStep } = useStepSettingsContext();
  const outputSampleData = useBuilderStateContext(
    (state) => state.outputSampleData,
  );
  const flowVersion = useBuilderStateContext((state) => state.flowVersion);

  const containerRef = useRef<HTMLDivElement>(null);
  const [adapterId, setAdapterId] = useState<SchemaAdapterId>('json_sample');

  const priorSteps = flowStructureUtil.findPathToStep(
    flowVersion.trigger,
    selectedStep.name,
  );

  const sourceData: unknown = form.watch(SOURCE_DATA_FIELD);
  const sourceStepName = extractSourceStepName(sourceData);
  const sample = sourceStepName ? outputSampleData[sourceStepName] : undefined;

  const spec = toSpec(form.watch(MAPPING_SPEC_FIELD));
  const sourceNodes = mapperSourceUtils.buildSourceTree(sample);
  const slots = spec.targetSchema?.snapshot
    ? mapperTargetUtils.deriveSlots(spec.targetSchema.snapshot)
    : [];

  const onSourceStepChange = (stepName: string) => {
    form.setValue(SOURCE_DATA_FIELD, `{{steps.${stepName}.output}}`);
    if (!form.getValues(MAPPING_SPEC_FIELD)) {
      form.setValue(MAPPING_SPEC_FIELD, mapperSpecUtils.createEmptySpec());
    }
  };

  const onSchema = (snapshot: NormalizedSchema) => {
    const next: MappingSpec = {
      ...spec,
      targetSchema: { source: adapterId, snapshot },
    };
    form.setValue(MAPPING_SPEC_FIELD, next);
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
        <SchemaAttachBar
          adapterId={adapterId}
          onAdapterIdChange={setAdapterId}
          onSchema={onSchema}
          disabled={readonly}
        />
      </div>

      <div
        ref={containerRef}
        className={cn('relative grid grid-cols-2 gap-4 rounded-md border p-3')}
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('Source fields')}</span>
          <SourceTree nodes={sourceNodes} disabled={readonly} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('Target schema')}</span>
          <TargetSlotList
            slots={slots}
            spec={spec}
            onChange={(next) => form.setValue(MAPPING_SPEC_FIELD, next)}
            disabled={readonly}
          />
        </div>
        <BindLineOverlay
          containerRef={containerRef}
          pairs={derivePairs(spec)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Preview')}</span>
        {sample !== undefined ? (
          <PreviewPane sample={sample} spec={spec} />
        ) : (
          <div
            className={cn(
              'rounded-md border p-3 text-sm text-muted-foreground',
            )}
          >
            {t('No source data yet. Test the source step to load a sample.')}
          </div>
        )}
      </div>
    </div>
  );
};

const SOURCE_DATA_FIELD = 'settings.input.sourceData';
const MAPPING_SPEC_FIELD = 'settings.input.mappingSpec';

type BindPair = {
  sourcePath: string;
  targetPath: string;
  status: 'valid' | 'missing';
};

type MapperStepConfigProps = {
  readonly: boolean;
};
