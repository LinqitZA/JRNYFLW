/// <reference types="vitest/globals" />
import { flowMigration } from '../tools/migrate-flow';

const PIECES = ['@jrnyflw/nucleus', '@jrnyflw/jrny', '@jrnyflw/shoprite'];

function pieceStep({ name, pieceName, input, nextAction, actionName = 'x', pieceVersion = '0.0.5' }: {
    name: string;
    pieceName: string;
    input: Record<string, unknown>;
    nextAction?: unknown;
    actionName?: string;
    pieceVersion?: string;
}) {
    return { name, type: 'PIECE', settings: { pieceName, pieceVersion, actionName, input }, ...(nextAction ? { nextAction } : {}) };
}

function sampleFlow() {
    const step10 = pieceStep({ name: 'step_10', pieceName: '@activepieces/piece-http', input: {} });
    const step3 = pieceStep({ name: 'step_3', pieceName: '@jrnyflw/jrny', input: { errorMessage: 'Hub: {{step_1.matchedOn}} / {{step_10}}' }, nextAction: step10 });
    const router = {
        name: 'step_2',
        type: 'ROUTER',
        settings: { branches: [{ conditions: [[{ firstValue: '{{step_1.hubCode}}', operator: 'TEXT_IS_NOT_EMPTY' }]] }] },
        nextAction: step3,
    };
    const step1 = pieceStep({
        name: 'step_1',
        pieceName: '@jrnyflw/nucleus',
        input: { suburb: '{{trigger.body.suburb}}', note: 'step_1 outside braces' },
        nextAction: router,
    });
    return { template: { trigger: { name: 'trigger', type: 'PIECE_TRIGGER', nextAction: step1 } } };
}

describe('flowMigration.migrate', () => {
    test('rewrites references to traced steps anywhere in the flow and bumps their version', () => {
        const result = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        const text = JSON.stringify(result.flow);
        expect(result.steps).toEqual(['step_1', 'step_3']);
        expect(text).toContain('{{step_1.output.hubCode}}');
        expect(text).toContain('Hub: {{step_1.output.matchedOn}}');
        expect(text).toContain('step_1 outside braces');
        expect(text).toContain('{{trigger.body.suburb}}');
        expect(text.match(/"pieceVersion":"0.1.0"/g)).toHaveLength(2);
        expect(text.match(/"pieceVersion":"0.0.5"/g)).toHaveLength(1);
        expect(result.references).toBe(2);
    });

    test('does not confuse step_1 with step_10', () => {
        const result = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        expect(JSON.stringify(result.flow)).toContain('{{step_10}}');
    });

    test('rewrites a whole-step reference', () => {
        const flow = pieceStep({ name: 'step_1', pieceName: '@jrnyflw/nucleus', input: { all: '{{step_1}}', indexed: "{{step_1['ResultSets'][0]}}" } });
        const text = JSON.stringify(flowMigration.migrate({ flow, pieceNames: PIECES, pieceVersion: '0.1.0' }).flow);
        expect(text).toContain('{{step_1.output}}');
        expect(text).toContain("{{step_1.output['ResultSets'][0]}}");
    });

    test('is idempotent', () => {
        const once = flowMigration.migrate({ flow: sampleFlow(), pieceNames: PIECES, pieceVersion: '0.1.0' });
        const twice = flowMigration.migrate({ flow: once.flow, pieceNames: PIECES, pieceVersion: '0.1.0' });
        expect(twice.flow).toEqual(once.flow);
        expect(twice.references).toBe(0);
        expect(JSON.stringify(twice.flow)).not.toContain('.output.output');
    });

    test('leaves Custom API Call steps alone, since their output did not change', () => {
        const flow = pieceStep({
            name: 'step_4',
            pieceName: '@jrnyflw/nucleus',
            actionName: 'custom_api_call',
            input: {},
            nextAction: pieceStep({ name: 'step_5', pieceName: '@jrnyflw/jrny', input: { waybill: '{{step_4.body.Waybill}}' } }),
        });
        const result = flowMigration.migrate({ flow, pieceNames: PIECES, pieceVersion: '0.1.0' });
        expect(JSON.stringify(result.flow)).toContain('{{step_4.body.Waybill}}');
        expect(result.steps).toEqual(['step_5']);
        expect(result.skipped).toEqual(['step_4']);
    });

    test('leaves steps already on the target version alone, so ok/error references survive a re-run', () => {
        const flow = pieceStep({
            name: 'step_5',
            pieceName: '@jrnyflw/nucleus',
            pieceVersion: '0.1.0',
            input: {},
            nextAction: pieceStep({
                name: 'step_6',
                pieceName: '@jrnyflw/jrny',
                input: { ok: '{{step_5.ok}}', message: '{{step_5.error.message}}', hub: '{{step_5.output.hubCode}}', old: '{{step_6.id}}' },
            }),
        });
        const result = flowMigration.migrate({ flow, pieceNames: PIECES, pieceVersion: '0.1.0' });
        const text = JSON.stringify(result.flow);
        expect(text).toContain('{{step_5.ok}}');
        expect(text).toContain('{{step_5.error.message}}');
        expect(text).toContain('{{step_5.output.hubCode}}');
        expect(text).toContain('{{step_6.output.id}}');
        expect(result.steps).toEqual(['step_6']);
        expect(result.skipped).toEqual(['step_5']);
    });
});
