// Builds docs/integrations/shoprite/shoprite-orders.flow.json and checks it against the import schema and the pieces' real props.
import { writeFileSync } from 'node:fs'
import { SharedTemplate } from '../../packages/shared/src/lib/management/template/template'
import { downloadOrders } from '../../packages/pieces/custom/shoprite/src/lib/actions/download-orders'
import { resolveOrderLines } from '../../packages/pieces/custom/jrny/src/lib/actions/resolve-order-lines'
import { createQuote } from '../../packages/pieces/custom/jrny/src/lib/actions/create-quote'
import { generatePick } from '../../packages/pieces/custom/jrny/src/lib/actions/generate-pick'
import { jrnyOperations } from '../../packages/pieces/custom/jrny/src/lib/operations'

// Placeholders on purpose: whoever imports must pick the connections, so the flow never lands on production JRNY by accident.
const SHOPRITE = "{{connections['pick-the-shoprite-connection']}}"
const JRNY = "{{connections['pick-the-jrny-dev-connection']}}"
const now = new Date().toISOString()
const item = (path: string) => `{{step_3['item']${path}}}`
const listOf = ({ step, path }: { step: string; path: string[] }) => `{{flattenNestedKeys(${step}, ['${path.join("', '")}'])}}`

function piece({ name, displayName, pieceName, actionName, input, dynamic = [], inLoop = false }: { name: string; displayName: string; pieceName: string; actionName: string; input: Record<string, unknown>; dynamic?: string[]; inLoop?: boolean }) {
    const propertySettings = Object.fromEntries(Object.keys(input).filter((key) => key !== 'auth').map((key) => [key, { type: dynamic.includes(key) ? 'DYNAMIC' : 'MANUAL' }]))
    return {
        name, displayName, type: 'PIECE', valid: false, skip: false, lastUpdatedDate: now,
        settings: { pieceName, pieceVersion: '0.1.0', actionName, input, propertySettings, sampleData: {}, errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: inLoop } } },
    }
}

function router({ name, displayName, branchName, conditions, child }: { name: string; displayName: string; branchName: string; conditions: unknown[]; child: unknown }) {
    return {
        name, displayName, type: 'ROUTER', valid: true, skip: false, lastUpdatedDate: now,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: [{ branchType: 'CONDITION', branchName, conditions: [conditions] }, { branchType: 'FALLBACK', branchName: 'Otherwise' }] },
        children: [child, null],
    }
}

const salesOrderNumber = "{{step_8['output']['salesOrder']['salesOrderNumber']}}"

const pick = piece({ name: 'step_10', displayName: 'Generate Pick', pieceName: '@jrnyflw/jrny', actionName: 'generate_pick', inLoop: true, input: { auth: JRNY, salesOrderNumber, onFailure: 'continue' } })

const quote = {
    ...piece({
        name: 'step_8', displayName: 'Create Quote', pieceName: '@jrnyflw/jrny', actionName: 'create_quote',
        dynamic: ['lines', 'autoConfirm'], inLoop: true,
        input: {
            auth: JRNY, customerCode: 'SHOE100',
            lines: {
                stockCode: listOf({ step: 'step_6', path: ['output', 'lines', 'stockCode'] }),
                qty: listOf({ step: 'step_6', path: ['output', 'lines', 'qty'] }),
                unitPrice: listOf({ step: 'step_6', path: ['output', 'lines', 'unitPrice'] }),
            },
            notes: "{{step_6['output']['notes']}}",
            externalReference: item("['orderNumber']"),
            portalCode: 'SHOPRITE',
            deliveryAddressMode: 'byCode',
            deliveryAddressCode: "{{step_6['output']['addressCode']}}",
            autoConvert: true,
            autoConfirm: "{{step_6['output']['clean']}}",
            deliveryDate: item("['deliveryDate']"),
            idempotencyKey: `shoprite-${item("['orderNumber']")}`,
            onFailure: 'continue',
        },
    }),
    nextAction: router({
        name: 'step_9', displayName: 'Clean and created?', branchName: 'Generate the pick',
        conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_8['ok']}}" }, { operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_6['output']['clean']}}" }],
        child: pick,
    }),
}

const resolve = {
    ...piece({
        name: 'step_6', displayName: 'Resolve Order Lines', pieceName: '@jrnyflw/jrny', actionName: 'resolve_order_lines',
        dynamic: ['lines', 'warnings'], inLoop: true,
        input: {
            auth: JRNY, customerCode: 'SHOE100',
            addressCode: item("['store']['branch']"),
            fallbackAddressCode: '0001',
            notePrefix: `Shoprite PO ${item("['orderNumber']")}, ${item("['store']['name']")} (${item("['store']['branch']")})`,
            lines: {
                stockCode: listOf({ step: 'step_3', path: ['item', 'lines', 'supplierItemCode'] }),
                barcode: listOf({ step: 'step_3', path: ['item', 'lines', 'gtin'] }),
                quantity: listOf({ step: 'step_3', path: ['item', 'lines', 'quantity'] }),
                unitPrice: listOf({ step: 'step_3', path: ['item', 'lines', 'unitPriceExclVat'] }),
                description: listOf({ step: 'step_3', path: ['item', 'lines', 'description'] }),
                reference: listOf({ step: 'step_3', path: ['item', 'lines', 'lineNumber'] }),
            },
            warnings: item("['warnings']"),
            onFailure: 'continue',
        },
    }),
    nextAction: router({
        name: 'step_7', displayName: 'Anything to load?', branchName: 'Create the quote',
        conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_6['ok']}}" }, { operator: 'NUMBER_IS_GREATER_THAN', firstValue: "{{step_6['output']['lineCount']}}", secondValue: '0' }],
        child: quote,
    }),
}

const alreadyLoaded = {
    ...piece({ name: 'step_4', displayName: 'Already loaded? (List Quotations)', pieceName: '@jrnyflw/jrny', actionName: 'list_quotations', inLoop: true, input: { auth: JRNY, externalRef: item("['orderNumber']"), onFailure: 'continue' } }),
    nextAction: router({
        name: 'step_5', displayName: 'New order?', branchName: 'Not in JRNY yet',
        conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_4['ok']}}" }, { operator: 'LIST_IS_EMPTY', firstValue: "{{step_4['output']['data']}}" }],
        child: resolve,
    }),
}

const loop = { name: 'step_3', displayName: 'Each order', type: 'LOOP_ON_ITEMS', valid: true, skip: false, lastUpdatedDate: now, settings: { items: "{{step_1['output']['orders']}}" }, firstLoopAction: alreadyLoaded }

const download = {
    ...piece({ name: 'step_1', displayName: 'Download Orders', pieceName: '@jrnyflw/shoprite', actionName: 'download_orders', input: { auth: SHOPRITE, onFailure: 'stop' } }),
    nextAction: router({
        name: 'step_2', displayName: 'Any orders?', branchName: 'Orders to load',
        conditions: [{ operator: 'NUMBER_IS_GREATER_THAN', firstValue: "{{step_1['output']['count']}}", secondValue: '0' }],
        child: loop,
    }),
}

const trigger = {
    name: 'trigger', displayName: '08:00 and 16:00', type: 'PIECE_TRIGGER', valid: true, lastUpdatedDate: now,
    settings: {
        pieceName: '@activepieces/piece-schedule', pieceVersion: '0.1.17', triggerName: 'cron_expression',
        input: { cronExpression: '0 8,16 * * *', timezone: 'Africa/Johannesburg' },
        propertySettings: { cronExpression: { type: 'MANUAL' }, timezone: { type: 'MANUAL' } }, sampleData: {},
    },
    nextAction: download,
}

const template = {
    name: 'Shoprite Orders → JRNY', type: 'SHARED', summary: '',
    description: 'Downloads Shoprite B2B orders (read-only, never acknowledges) and loads each into JRNY: confirmed with a pick when clean, a draft with notes otherwise.',
    tags: [], blogUrl: '', metadata: { externalId: 'shopriteOrdersV1xxxxxxx' }, author: 'JRNYFLW Admin', categories: [],
    pieces: ['@activepieces/piece-schedule', '@jrnyflw/shoprite', '@jrnyflw/jrny'], status: 'PUBLISHED',
    flows: [{ displayName: 'Shoprite Orders → JRNY', valid: false, schemaVersion: '20', notes: [], trigger }],
}

const listQuotationParams = jrnyOperations.find((op) => op.name === 'list_quotations')?.queryParams.map((q) => q.name) ?? []
const propsOf: Record<string, string[]> = {
    download_orders: Object.keys(downloadOrders.props),
    resolve_order_lines: Object.keys(resolveOrderLines.props),
    create_quote: Object.keys(createQuote.props),
    generate_pick: Object.keys(generatePick.props),
    list_quotations: [...listQuotationParams, 'onFailure'],
}
const problems: string[] = []
for (const step of [download, alreadyLoaded, resolve, quote, pick]) {
    const known = propsOf[step.settings.actionName]
    for (const key of Object.keys(step.settings.input).filter((k) => k !== 'auth')) {
        if (!known.includes(key)) problems.push(`${step.name} (${step.settings.actionName}) has no prop ${key}`)
    }
}
// The engine checks props before a piece's own Continue handling runs, so only continueOnFailure keeps one bad order from stopping the loop.
for (const step of [alreadyLoaded, resolve, quote, pick]) {
    if (step.settings.errorHandlingOptions.continueOnFailure.value !== true) problems.push(`${step.name} must continue on failure: it runs inside the loop`)
}
if (resolve.settings.input.warnings === undefined) problems.push('step_6 must receive the order warnings')
const parsed = SharedTemplate.safeParse(template)
if (!parsed.success) problems.push(JSON.stringify(parsed.error.issues, null, 2))
if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
}
writeFileSync(process.argv[2], JSON.stringify(template, null, 2) + '\n')
console.log('valid, written to', process.argv[2])
