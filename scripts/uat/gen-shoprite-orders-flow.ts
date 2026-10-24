// Builds docs/integrations/shoprite/shoprite-orders.flow.json and checks it against the import schema and the pieces' real props.
import { writeFileSync } from 'node:fs'
import { SharedTemplate } from '../../packages/shared/src/lib/management/template/template'
import { downloadOrders } from '../../packages/pieces/custom/shoprite/src/lib/actions/download-orders'
import { resolveOrderLines } from '../../packages/pieces/custom/jrny/src/lib/actions/resolve-order-lines'
import { createQuote } from '../../packages/pieces/custom/jrny/src/lib/actions/create-quote'
import { generatePick } from '../../packages/pieces/custom/jrny/src/lib/actions/generate-pick'
import { acknowledgeOrders } from '../../packages/pieces/custom/shoprite/src/lib/actions/acknowledge-orders'
import { jrnyOperations } from '../../packages/pieces/custom/jrny/src/lib/operations'

// Placeholders on purpose: whoever imports must pick the connections, so the flow never lands on production JRNY by accident.
const SHOPRITE = "{{connections['pick-the-shoprite-connection']}}"
const now = new Date().toISOString()
// The live flow acknowledges orders, so it is only for after the old platform has stopped reading the same Shoprite account.
const live = process.argv.includes('--acknowledge')
const JRNY = live ? "{{connections['pick-the-jrny-production-connection']}}" : "{{connections['pick-the-jrny-dev-connection']}}"
const item = (path: string) => `{{step_3['item']${path}}}`
const listOf = ({ step, path }: { step: string; path: string[] }) => `{{flattenNestedKeys(${step}, ['${path.join("', '")}'])}}`

function piece({ name, displayName, pieceName, actionName, input, dynamic = [], inLoop = false }: { name: string; displayName: string; pieceName: string; actionName: string; input: Record<string, unknown>; dynamic?: string[]; inLoop?: boolean }) {
    const propertySettings = Object.fromEntries(Object.keys(input).filter((key) => key !== 'auth').map((key) => [key, { type: dynamic.includes(key) ? 'DYNAMIC' : 'MANUAL' }]))
    return {
        name, displayName, type: 'PIECE', valid: false, skip: false, lastUpdatedDate: now,
        settings: { pieceName, pieceVersion: '0.1.0', actionName, input, propertySettings, sampleData: {}, errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: inLoop } } },
    }
}

// anyOf holds OR'd groups of AND'd conditions, for a branch that more than one outcome should take.
function router({ name, displayName, branchName, conditions = [], anyOf, child, otherwise = null }: { name: string; displayName: string; branchName: string; conditions?: unknown[]; anyOf?: unknown[][]; child: unknown; otherwise?: unknown }) {
    return {
        name, displayName, type: 'ROUTER', valid: true, skip: false, lastUpdatedDate: now,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: [{ branchType: 'CONDITION', branchName, conditions: anyOf ?? [conditions] }, { branchType: 'FALLBACK', branchName: 'Otherwise' }] },
        children: [child, otherwise],
    }
}

// Acknowledged orders never download again, so an order is acknowledged only once it is in JRNY.
function ack(name: string) {
    return piece({ name, displayName: 'Acknowledge Order', pieceName: '@jrnyflw/shoprite', actionName: 'acknowledge_orders', inLoop: true, input: { auth: SHOPRITE, orderNumbers: item("['orderNumber']"), onFailure: 'continue' } })
}

const salesOrderNumber = "{{step_8['output']['salesOrder']['salesOrderNumber']}}"

const pick = piece({ name: 'step_10', displayName: 'Generate Pick', pieceName: '@jrnyflw/jrny', actionName: 'generate_pick', inLoop: true, input: { auth: JRNY, salesOrderNumber, onFailure: 'continue' } })

const ackExisting = ack('step_12')
const ackNew = ack('step_14')

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
                uom: listOf({ step: 'step_6', path: ['output', 'lines', 'uom'] }),
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
    nextAction: {
        ...router({
            name: 'step_9', displayName: 'Clean and created?', branchName: 'Generate the pick',
            conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_8['ok']}}" }, { operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_6['output']['clean']}}" }],
            child: pick,
        }),
        // JRNY refuses a Shoprite order it already holds (including a cancelled one) with DUPLICATE_PORTAL_ORDER, so that also means "in JRNY".
        ...(live ? {
            nextAction: router({
                name: 'step_13', displayName: 'In JRNY?', branchName: 'Acknowledge it',
                anyOf: [
                    [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_8['ok']}}" }],
                    [{ operator: 'TEXT_EXACTLY_MATCHES', firstValue: "{{step_8['error']['code']}}", secondValue: 'DUPLICATE_PORTAL_ORDER', caseSensitive: true }],
                ],
                child: ackNew,
            }),
        } : {}),
    },
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
                // AON's JRNY products for Shoprite are coded by Shoprite's item number. The old supplier codes either miss or hit a superseded product.
                stockCode: listOf({ step: 'step_3', path: ['item', 'lines', 'buyerItemCode'] }),
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

// The old platform creates sales orders directly, with the Shoprite order number as the customer PO and no quote or portal code,
// so neither the quote check nor JRNY's DUPLICATE_PORTAL_ORDER sees them. poReference matches the customer PO or the external reference.
const salesOrderCheck = {
    ...piece({ name: 'step_15', displayName: 'Already loaded? (List Sales Orders)', pieceName: '@jrnyflw/jrny', actionName: 'list_sales_orders', inLoop: true, input: { auth: JRNY, customerCode: 'SHOE100', poReference: item("['orderNumber']"), onFailure: 'continue' } }),
    nextAction: router({
        name: 'step_5', displayName: 'New order?', branchName: 'Not in JRNY yet',
        conditions: [
            { operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_4['ok']}}" }, { operator: 'LIST_IS_EMPTY', firstValue: "{{step_4['output']['data']}}" },
            { operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_15['ok']}}" }, { operator: 'LIST_IS_EMPTY', firstValue: "{{step_15['output']['data']}}" },
        ],
        child: resolve,
        // A failed check is neither "new" nor "in JRNY": the order is left alone and comes back next run.
        otherwise: live ? router({
            name: 'step_11', displayName: 'Already in JRNY?', branchName: 'Acknowledge it',
            anyOf: [
                [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_4['ok']}}" }, { operator: 'LIST_IS_NOT_EMPTY', firstValue: "{{step_4['output']['data']}}" }],
                [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_15['ok']}}" }, { operator: 'LIST_IS_NOT_EMPTY', firstValue: "{{step_15['output']['data']}}" }],
            ],
            child: ackExisting,
        }) : null,
    }),
}

const alreadyLoaded = {
    ...piece({ name: 'step_4', displayName: 'Already loaded? (List Quotations)', pieceName: '@jrnyflw/jrny', actionName: 'list_quotations', inLoop: true, input: { auth: JRNY, customerCode: 'SHOE100', externalRef: item("['orderNumber']"), onFailure: 'continue' } }),
    nextAction: salesOrderCheck,
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
    name: 'trigger', displayName: 'Hourly, 06:00 to 18:00', type: 'PIECE_TRIGGER', valid: true, lastUpdatedDate: now,
    settings: {
        pieceName: '@activepieces/piece-schedule', pieceVersion: '0.1.17', triggerName: 'cron_expression',
        // Shoprite places 80 to 100 orders a day; hourly runs keep each batch small enough for JRNY's per-key rate limit and the run time limit.
        input: { cronExpression: '0 6-18 * * *', timezone: 'Africa/Johannesburg' },
        propertySettings: { cronExpression: { type: 'MANUAL' }, timezone: { type: 'MANUAL' } }, sampleData: {},
    },
    nextAction: download,
}

const template = {
    name: live ? 'Shoprite Orders → JRNY (live, acknowledges)' : 'Shoprite Orders → JRNY', type: 'SHARED', summary: '',
    description: live
        ? 'LIVE: downloads Shoprite B2B orders, loads each into JRNY (confirmed with a pick when clean, a draft with notes otherwise) and acknowledges every order now in JRNY. Run only once the old platform has stopped.'
        : 'Downloads Shoprite B2B orders (read-only, never acknowledges) and loads each into JRNY: confirmed with a pick when clean, a draft with notes otherwise.',
    tags: [], blogUrl: '', metadata: { externalId: live ? 'shopriteOrdersLiveV1xxx' : 'shopriteOrdersV1xxxxxxx' }, author: 'JRNYFLW Admin', categories: [],
    pieces: ['@activepieces/piece-schedule', '@jrnyflw/shoprite', '@jrnyflw/jrny'], status: 'PUBLISHED',
    flows: [{ displayName: live ? 'Shoprite Orders → JRNY (live)' : 'Shoprite Orders → JRNY', valid: false, schemaVersion: '20', notes: [], trigger }],
}

const listQuotationParams = jrnyOperations.find((op) => op.name === 'list_quotations')?.queryParams.map((q) => q.name) ?? []
const listSalesOrderParams = jrnyOperations.find((op) => op.name === 'list_sales_orders')?.queryParams.map((q) => q.name) ?? []
const propsOf: Record<string, string[]> = {
    download_orders: Object.keys(downloadOrders.props),
    resolve_order_lines: Object.keys(resolveOrderLines.props),
    create_quote: Object.keys(createQuote.props),
    generate_pick: Object.keys(generatePick.props),
    list_quotations: [...listQuotationParams, 'onFailure'],
    list_sales_orders: [...listSalesOrderParams, 'onFailure'],
    acknowledge_orders: Object.keys(acknowledgeOrders.props),
}
const ackSteps = live ? [ackExisting, ackNew] : []
const problems: string[] = []
for (const step of [download, alreadyLoaded, salesOrderCheck, resolve, quote, pick, ...ackSteps]) {
    const known = propsOf[step.settings.actionName]
    for (const key of Object.keys(step.settings.input).filter((k) => k !== 'auth')) {
        if (!known.includes(key)) problems.push(`${step.name} (${step.settings.actionName}) has no prop ${key}`)
    }
}
// The engine checks props before a piece's own Continue handling runs, so only continueOnFailure keeps one bad order from stopping the loop.
for (const step of [alreadyLoaded, salesOrderCheck, resolve, quote, pick, ...ackSteps]) {
    if (step.settings.errorHandlingOptions.continueOnFailure.value !== true) problems.push(`${step.name} must continue on failure: it runs inside the loop`)
}
if (resolve.settings.input.warnings === undefined) problems.push('step_6 must receive the order warnings')
const acknowledging = ['step_12', 'step_14'].map((name) => findStep({ node: template.flows[0].trigger, name }))
if (live && !acknowledging.every((step) => isRecord(step) && isRecord(step['settings']) && step['settings']['actionName'] === 'acknowledge_orders')) {
    problems.push('live flow must acknowledge in step_12 and step_14')
}
if (!live && JSON.stringify(template).includes('acknowledge_orders')) problems.push('the dev flow must never acknowledge')
const parsed = SharedTemplate.safeParse(template)
if (!parsed.success) problems.push(JSON.stringify(parsed.error.issues, null, 2))
if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
}
writeFileSync(process.argv[2], JSON.stringify(template, null, 2) + '\n')
console.log('valid, written to', process.argv[2])

function findStep({ node, name }: { node: unknown; name: string }): unknown {
    if (!isRecord(node)) return undefined
    if (node['name'] === name) return node
    const children = Array.isArray(node['children']) ? node['children'] : []
    for (const next of [node['nextAction'], node['firstLoopAction'], ...children]) {
        const found = findStep({ node: next, name })
        if (found !== undefined) return found
    }
    return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
