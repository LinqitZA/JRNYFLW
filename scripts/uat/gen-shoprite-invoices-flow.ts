// Builds docs/integrations/shoprite/shoprite-invoices.flow.json and checks it against the import schema and the pieces' real props.
import { writeFileSync } from 'node:fs'
import { SharedTemplate } from '../../packages/shared/src/lib/management/template/template'
import { sendInvoice } from '../../packages/pieces/custom/shoprite/src/lib/actions/send-invoice'
import { listInvoicesReady } from '../../packages/pieces/custom/jrny/src/lib/actions/list-invoices-ready'
import { recordInvoiceResult } from '../../packages/pieces/custom/jrny/src/lib/actions/record-invoice-result'

// Placeholders on purpose: whoever imports must pick the connections.
const SHOPRITE = "{{connections['pick-the-shoprite-connection']}}"
const JRNY = "{{connections['pick-the-jrny-production-connection']}}"
const now = new Date().toISOString()
const item = (path: string) => `{{step_3['item']${path}}}`
const listOf = (key: string) => `{{flattenNestedKeys(step_3, ['item', 'lines', '${key}'])}}`

const out = process.argv[2]
const fromDate = argAfter('--from-date')
if (out === undefined || fromDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    console.error('usage: gen-shoprite-invoices-flow.ts <out.json> --from-date YYYY-MM-DD (the switch-over date)')
    process.exit(1)
}

function argAfter(flag: string): string | undefined {
    const index = process.argv.indexOf(flag)
    return index === -1 ? undefined : process.argv[index + 1]
}

function piece({ name, displayName, pieceName, actionName, input, dynamic = [], inLoop = false }: { name: string; displayName: string; pieceName: string; actionName: string; input: Record<string, unknown>; dynamic?: string[]; inLoop?: boolean }) {
    const propertySettings = Object.fromEntries(Object.keys(input).filter((key) => key !== 'auth').map((key) => [key, { type: dynamic.includes(key) ? 'DYNAMIC' : 'MANUAL' }]))
    return {
        name, displayName, type: 'PIECE', valid: false, skip: false, lastUpdatedDate: now,
        settings: { pieceName, pieceVersion: '0.1.0', actionName, input, propertySettings, sampleData: {}, errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: inLoop } } },
    }
}

function router({ name, displayName, branchName, conditions, child, otherwise = null }: { name: string; displayName: string; branchName: string; conditions: unknown[]; child: unknown; otherwise?: unknown }) {
    return {
        name, displayName, type: 'ROUTER', valid: true, skip: false, lastUpdatedDate: now,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: [{ branchType: 'CONDITION', branchName, conditions: [conditions] }, { branchType: 'FALLBACK', branchName: 'Otherwise' }] },
        children: [child, otherwise],
    }
}

const record = ({ name, displayName, input }: { name: string; displayName: string; input: Record<string, unknown> }) =>
    piece({ name, displayName, pieceName: '@jrnyflw/jrny', actionName: 'record_invoice_result', inLoop: true, input: { auth: JRNY, invoiceNumber: item("['invoiceNumber']"), ...input, onFailure: 'continue' } })

const recordSent = record({ name: 'step_7', displayName: 'Record sent in JRNY', input: { status: 'sent', externalReference: "{{step_5['output']['invoiceRefNo']}}" } })
const recordFailed = record({ name: 'step_8', displayName: 'Record failed in JRNY', input: { status: 'failed', errorCode: "{{step_5['error']['code']}}", message: "{{step_5['error']['message']}}" } })
const recordProblem = record({ name: 'step_9', displayName: 'Record problem in JRNY', input: { status: 'failed', errorCode: 'INVALID', message: item("['problem']") } })

const sendLines = {
    lineNumber: listOf('lineNumber'), quantity: listOf('quantity'), lineTotalExclVat: listOf('lineTotalExclVat'),
    lineTotalInclVat: listOf('lineTotalInclVat'), description: listOf('description'), gtin: listOf('gtin'),
}

const send = {
    ...piece({
        name: 'step_5', displayName: 'Send Invoice', pieceName: '@jrnyflw/shoprite', actionName: 'send_invoice', dynamic: ['lines'], inLoop: true,
        input: {
            auth: SHOPRITE,
            invoiceNumber: item("['invoiceNumber']"),
            invoiceDate: item("['invoiceDate']"),
            purchaseOrder: item("['purchaseOrder']"),
            storeGln: item("['storeGln']"),
            totalExclVat: item("['totalExclVat']"),
            totalVat: item("['totalVat']"),
            totalInclVat: item("['totalInclVat']"),
            lines: sendLines,
            onFailure: 'continue',
        },
    }),
    nextAction: router({ name: 'step_6', displayName: 'Sent?', branchName: 'Sent', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_5['ok']}}" }], child: recordSent, otherwise: recordFailed }),
}

const clean = router({ name: 'step_4', displayName: 'Clean?', branchName: 'Clean', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: item("['clean']") }], child: send, otherwise: recordProblem })
const loop = { name: 'step_3', displayName: 'Each invoice', type: 'LOOP_ON_ITEMS', valid: true, skip: false, lastUpdatedDate: now, settings: { items: "{{step_1['output']['invoices']}}" }, firstLoopAction: clean }

const ready = {
    ...piece({ name: 'step_1', displayName: 'List Invoices Ready to Send', pieceName: '@jrnyflw/jrny', actionName: 'list_invoices_ready_to_send', input: { auth: JRNY, customerCode: 'SHOE100', fromDate, maxInvoices: 50, onFailure: 'stop' } }),
    nextAction: router({ name: 'step_2', displayName: 'Anything to send?', branchName: 'Invoices to send', conditions: [{ operator: 'NUMBER_IS_GREATER_THAN', firstValue: "{{step_1['output']['count']}}", secondValue: '0' }], child: loop }),
}

const trigger = {
    name: 'trigger', displayName: 'Hourly 07:00 to 19:00', type: 'PIECE_TRIGGER', valid: true, lastUpdatedDate: now,
    settings: {
        pieceName: '@activepieces/piece-schedule', pieceVersion: '0.1.17', triggerName: 'cron_expression',
        input: { cronExpression: '0 7-19 * * *', timezone: 'Africa/Johannesburg' },
        propertySettings: { cronExpression: { type: 'MANUAL' }, timezone: { type: 'MANUAL' } }, sampleData: {},
    },
    nextAction: ready,
}

const template = {
    name: 'Shoprite Invoices from JRNY', type: 'SHARED', summary: '',
    description: `Sends delivered SHOE100 invoices from ${fromDate} on to Shoprite as GS1 invoices and records sent or failed in JRNY. UNCONFIRMED invoices are never resent automatically.`,
    tags: [], blogUrl: '', metadata: { externalId: 'shopriteInvoicesV1xxxxx' }, author: 'JRNYFLW Admin', categories: [],
    pieces: ['@activepieces/piece-schedule', '@jrnyflw/shoprite', '@jrnyflw/jrny'], status: 'PUBLISHED',
    flows: [{ displayName: 'Shoprite Invoices from JRNY', valid: false, schemaVersion: '20', notes: [], trigger }],
}

const propsOf: Record<string, string[]> = {
    list_invoices_ready_to_send: Object.keys(listInvoicesReady.props),
    send_invoice: Object.keys(sendInvoice.props),
    record_invoice_result: Object.keys(recordInvoiceResult.props),
}
const sendLineKeys = Object.keys(sendInvoice.props.lines.properties ?? {})
const problems: string[] = []
for (const step of [ready, send, recordSent, recordFailed, recordProblem]) {
    const known = propsOf[step.settings.actionName]
    for (const key of Object.keys(step.settings.input).filter((k) => k !== 'auth')) {
        if (!known.includes(key)) problems.push(`${step.name} (${step.settings.actionName}) has no prop ${key}`)
    }
}
for (const key of Object.keys(sendLines)) {
    if (!sendLineKeys.includes(key)) problems.push(`step_5 lines have no field ${key}`)
}
// The engine checks props before a piece's own Continue handling runs, so only continueOnFailure keeps one bad invoice from stopping the loop.
for (const step of [send, recordSent, recordFailed, recordProblem]) {
    if (step.settings.errorHandlingOptions.continueOnFailure.value !== true) problems.push(`${step.name} must continue on failure: it runs inside the loop`)
}
const parsed = SharedTemplate.safeParse(template)
if (!parsed.success) problems.push(JSON.stringify(parsed.error.issues, null, 2))
if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
}
writeFileSync(out, JSON.stringify(template, null, 2) + '\n')
console.log('valid, written to', out)
