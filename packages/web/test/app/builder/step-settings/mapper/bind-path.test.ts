// @vitest-environment jsdom
import { bindLineUtils } from '@/app/builder/step-settings/mapper/bind-line-overlay';

describe('bezierPath', () => {
  test('produces a cubic bezier between two points', () => {
    expect(bindLineUtils.bezierPath({ from: { x: 0, y: 0 }, to: { x: 100, y: 50 } })).toBe(
      'M 0 0 C 50 0, 50 50, 100 50',
    );
  });
});
