import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { cn } from '@/lib/utils';

type Point = { x: number; y: number };

type BindPair = {
  sourcePath: string;
  targetPath: string;
  status: 'valid' | 'missing';
};

type BindLineOverlayProps = {
  containerRef: RefObject<HTMLElement | null>;
  pairs: BindPair[];
};

type RenderedLine = { d: string; status: 'valid' | 'missing'; key: string };

export const BindLineOverlay = ({
  containerRef,
  pairs,
}: BindLineOverlayProps) => {
  const [lines, setLines] = useState<RenderedLine[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const next: RenderedLine[] = [];

      for (const pair of pairs) {
        const sourceEl = container.querySelector(
          `[data-jrny-mapping-source="${cssEscape(pair.sourcePath)}"]`,
        );
        const targetEl = container.querySelector(
          `[data-jrny-mapping-target="${cssEscape(pair.targetPath)}"]`,
        );

        if (
          !(sourceEl instanceof HTMLElement) ||
          !(targetEl instanceof HTMLElement)
        )
          continue;

        const s = sourceEl.getBoundingClientRect();
        const tt = targetEl.getBoundingClientRect();

        const from: Point = {
          x: s.right - containerRect.left,
          y: s.top + s.height / 2 - containerRect.top,
        };
        const to: Point = {
          x: tt.left - containerRect.left,
          y: tt.top + tt.height / 2 - containerRect.top,
        };

        next.push({
          d: bezierPath({ from, to }),
          status: pair.status,
          key: `${pair.sourcePath}->${pair.targetPath}`,
        });
      }

      setLines(next);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [pairs, containerRef]);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {lines.map((line) => (
        <path
          key={line.key}
          d={line.d}
          fill="none"
          strokeWidth={2}
          className={cn(
            line.status === 'missing'
              ? 'stroke-amber-500'
              : 'stroke-muted-foreground',
          )}
        />
      ))}
    </svg>
  );
};

function cssEscape(value: string): string {
  return value.replace(/"/g, '\\"');
}

function bezierPath({ from, to }: { from: Point; to: Point }): string {
  const midX = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

export const bindLineUtils = { bezierPath };
