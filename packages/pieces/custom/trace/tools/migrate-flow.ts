function migrate({ flow, pieceNames, pieceVersion }: MigrateParams): MigrateResult {
    const steps = new Set<string>();
    collectSteps({ value: flow, pieceNames, steps });
    const ctx: RewriteContext = { steps, pieceNames, pieceVersion, references: 0 };
    const migrated = rewrite({ value: flow, ctx });
    return { flow: migrated, steps: [...steps].sort(), references: ctx.references };
}

function collectSteps({ value, pieceNames, steps }: { value: unknown; pieceNames: string[]; steps: Set<string> }): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectSteps({ value: item, pieceNames, steps }));
        return;
    }
    if (!isRecord(value)) {
        return;
    }
    const name = tracedStepName({ value, pieceNames });
    if (name !== null) {
        steps.add(name);
    }
    Object.values(value).forEach((item) => collectSteps({ value: item, pieceNames, steps }));
}

function rewrite({ value, ctx }: { value: unknown; ctx: RewriteContext }): unknown {
    if (typeof value === 'string') {
        return rewriteText({ text: value, ctx });
    }
    if (Array.isArray(value)) {
        return value.map((item) => rewrite({ value: item, ctx }));
    }
    if (!isRecord(value)) {
        return value;
    }
    const result: Record<string, unknown> = Object.fromEntries(
        Object.entries(value).map(([key, item]): [string, unknown] => [key, rewrite({ value: item, ctx })]),
    );
    const settings = result['settings'];
    if (tracedStepName({ value, pieceNames: ctx.pieceNames }) !== null && isRecord(settings)) {
        result['settings'] = { ...settings, pieceVersion: ctx.pieceVersion };
    }
    return result;
}

function rewriteText({ text, ctx }: { text: string; ctx: RewriteContext }): string {
    return text.replace(TEMPLATE, (_whole: string, expression: string) => {
        const rewritten = expression.replace(STEP_REFERENCE, (match: string, name: string) => {
            if (!ctx.steps.has(name)) {
                return match;
            }
            ctx.references += 1;
            return `${name}.output`;
        });
        return `{{${rewritten}}}`;
    });
}

function tracedStepName({ value, pieceNames }: { value: Record<string, unknown>; pieceNames: string[] }): string | null {
    const name = value['name'];
    const settings = value['settings'];
    if (value['type'] !== 'PIECE' || typeof name !== 'string' || !isRecord(settings)) {
        return null;
    }
    const pieceName = settings['pieceName'];
    return typeof pieceName === 'string' && pieceNames.includes(pieceName) ? name : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TEMPLATE = /\{\{([\s\S]*?)\}\}/g;
// The negative lookahead keeps a second run from producing step_N.output.output.
const STEP_REFERENCE = /\b(step_\d+)\b(?!\.output\b)/g;

export const flowMigration = { migrate };

type RewriteContext = { steps: Set<string>; pieceNames: string[]; pieceVersion: string; references: number };
type MigrateParams = { flow: unknown; pieceNames: string[]; pieceVersion: string };
type MigrateResult = { flow: unknown; steps: string[]; references: number };
