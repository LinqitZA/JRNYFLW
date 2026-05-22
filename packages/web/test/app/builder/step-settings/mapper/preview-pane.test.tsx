// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { PreviewPane } from '@/app/builder/step-settings/mapper/preview-pane';

describe('PreviewPane', () => {
  test('renders the engine output for a grouped spec', () => {
    const spec = {
      specVersion: 1 as const,
      mode: 'auto' as const,
      groupBy: ['CustomerPONumber'],
      fields: [
        {
          target: 'po_number',
          binding: { kind: 'header' as const, source: 'CustomerPONumber' },
        },
        {
          target: 'lines',
          binding: {
            kind: 'line_collection' as const,
            items: [
              {
                target: 'product_code',
                binding: { kind: 'row' as const, source: 'SKU' },
              },
            ],
          },
        },
      ],
    };
    render(
      <PreviewPane
        sample={[{ CustomerPONumber: 'PO-1', SKU: 'A' }]}
        spec={spec}
      />,
    );
    /* eslint-disable-next-line jest-dom/prefer-in-document -- jest-dom matchers are not configured in this project's vitest setup */
    expect(screen.getByText(/PO-1/)).toBeTruthy();
  });
});
