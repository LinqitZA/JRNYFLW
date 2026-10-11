import { readFileSync, writeFileSync } from 'node:fs';
import { flowMigration } from './migrate-flow';

const PIECE_NAMES = ['@jrnyflw/jrny', '@jrnyflw/nucleus', '@jrnyflw/shoprite'];

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error('Usage: npx tsx packages/pieces/custom/trace/tools/migrate-flow-cli.ts <exported-flow.json> <migrated-flow.json>');
    process.exit(1);
}
const flow: unknown = JSON.parse(readFileSync(input, 'utf-8'));
const result = flowMigration.migrate({ flow, pieceNames: PIECE_NAMES, pieceVersion: '0.1.0' });
writeFileSync(output, `${JSON.stringify(result.flow, null, 2)}\n`);
console.log(`Steps migrated: ${result.steps.join(', ') || 'none'}`);
console.log(`References rewritten: ${result.references}`);
