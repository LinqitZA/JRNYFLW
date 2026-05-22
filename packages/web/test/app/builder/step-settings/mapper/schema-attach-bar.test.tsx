// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (k: string) => k }));

import { SchemaAttachBar } from '@/app/builder/step-settings/mapper/schema-attach-bar';

describe('SchemaAttachBar', () => {
  test('parses a pasted JSON sample and emits the schema', () => {
    const onSchema = vi.fn();
    render(<SchemaAttachBar adapterId="json_sample" onAdapterIdChange={() => {}} onSchema={onSchema} disabled={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByText('Parse schema'));
    expect(onSchema).toHaveBeenCalledWith({ root: 'object', fields: [{ name: 'a', type: 'number' }] });
  });

  test('shows an error when parsing fails', () => {
    render(<SchemaAttachBar adapterId="json_sample" onAdapterIdChange={() => {}} onSchema={() => {}} disabled={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Parse schema'));
    expect(screen.getByText('Could not parse the schema')).toBeTruthy();
  });
});
