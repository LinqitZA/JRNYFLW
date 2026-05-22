// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { TransformPicker } from '@/app/builder/step-settings/mapper/transform-picker';

describe('TransformPicker', () => {
  test('adds a transform when an option is chosen', () => {
    const onChange = vi.fn();
    render(<TransformPicker selected={[]} onChange={onChange} disabled={false} />);
    fireEvent.click(screen.getByText('trim'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'trim' }]);
  });
});
