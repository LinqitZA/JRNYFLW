// @vitest-environment jsdom
import { act } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, test, vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

vi.mock('i18next', () => ({ t: (k: string) => k }));

const outputSampleData: Record<string, unknown> = {
  step_1: [{ CustomerPONumber: 'PO-1', SKU: 'A', Qty: '2' }],
};

vi.mock('@/app/builder/builder-hooks', () => ({
  useBuilderStateContext: (selector: (s: unknown) => unknown) =>
    selector({
      outputSampleData,
      flowVersion: {
        trigger: {
          name: 'trigger',
          displayName: 'Trigger',
          nextAction: {
            name: 'step_1',
            displayName: 'Excel',
            type: 'PIECE',
          },
        },
      },
    }),
}));

vi.mock('@/app/builder/step-settings/step-settings-context', () => ({
  useStepSettingsContext: () => ({
    selectedStep: { name: 'step_2', displayName: 'Mapper', type: 'PIECE' },
    pieceModel: { name: '@jrnyflw/mapper' },
  }),
}));

import { MapperStepConfig } from '@/app/builder/step-settings/mapper/index';

const Harness = () => {
  const form = useForm({
    defaultValues: {
      settings: { input: { sourceData: undefined, mappingSpec: undefined } },
    },
  });
  return (
    <DndProvider backend={HTML5Backend}>
      <FormProvider {...form}>
        <MapperStepConfig readonly={false} />
      </FormProvider>
    </DndProvider>
  );
};

let container: HTMLDivElement | null = null;

afterEach(() => {
  if (container) {
    container.remove();
    container = null;
  }
});

const mountHarness = (): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // eslint-disable-next-line testing-library/no-unnecessary-act
  act(() => {
    root.render(<Harness />);
  });
  return container;
};

describe('MapperStepConfig', () => {
  test('renders the source step picker and target schema region', () => {
    const mounted = mountHarness();
    /* eslint-disable jest-dom/prefer-to-have-text-content -- jest-dom matchers are not configured in this project's vitest setup */
    expect(mounted.textContent).toContain('Source step');
    expect(mounted.textContent).toContain('Target schema');
    /* eslint-enable jest-dom/prefer-to-have-text-content */
  });
});
