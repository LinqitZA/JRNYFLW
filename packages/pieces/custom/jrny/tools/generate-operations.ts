import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPEC = resolve(process.cwd(), 'docs/integrations/jrny/integration-openapi.json');
const OUT = resolve(process.cwd(), 'packages/pieces/custom/jrny/src/lib/operations.ts');

function snake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
}
function humanize(s: string): string {
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Param = { name: string; in: string; required?: boolean };
type Op = { name: string; displayName: string; description: string; method: string; path: string; tag: string; pathParams: string[]; queryParams: { name: string; required: boolean }[]; hasBody: boolean };

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const ops: Op[] = [];
for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
  for (const [method, opRaw] of Object.entries(item)) {
    const op = opRaw as { operationId: string; summary?: string; tags?: string[]; parameters?: Param[]; requestBody?: unknown };
    const suffix = op.operationId.includes('_') ? op.operationId.split('_').slice(1).join('_') : op.operationId;
    const params = op.parameters ?? [];
    ops.push({
      name: snake(suffix),
      displayName: humanize(suffix),
      description: op.summary ?? '',
      method: method.toUpperCase(),
      path,
      tag: op.tags?.[0] ?? 'Integration',
      pathParams: params.filter((p) => p.in === 'path' && p.name !== 'entityId').map((p) => p.name),
      queryParams: params.filter((p) => p.in === 'query').map((p) => ({ name: p.name, required: p.required ?? false })),
      hasBody: op.requestBody != null,
    });
  }
}
const banner = '// AUTO-GENERATED from docs/integrations/jrny/integration-openapi.json by tools/generate-operations.ts. Do not edit by hand.';
writeFileSync(OUT, `${banner}\nimport { JrnyOperation } from './operation-types';\n\nexport const jrnyOperations: JrnyOperation[] = ${JSON.stringify(ops, null, 2)};\n`);
console.log(`Wrote ${ops.length} operations to ${OUT}`);
