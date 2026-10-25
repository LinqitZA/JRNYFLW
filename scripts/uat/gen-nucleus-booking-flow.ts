// Builds docs/integrations/nucleus/courier-booking.flow.json: books a JRNY dispatch with Nucleus and reports every outcome back to JRNY.
// Checks the flow against the import schema and the pieces' real props, and runs its template expressions against sample runs.
import { writeFileSync } from 'node:fs'
import { SharedTemplate } from '../../packages/shared/src/lib/management/template/template'
import { findHubCodeForAddress } from '../../packages/pieces/custom/nucleus/src/lib/actions/find-hub-code-for-address'
import { createWaybillImportHeader } from '../../packages/pieces/custom/nucleus/src/lib/actions/create-waybill-import-header'
import { createWaybillImportDimsAndDetail } from '../../packages/pieces/custom/nucleus/src/lib/actions/create-waybill-import-dims-and-detail'
import { courierResponse } from '../../packages/pieces/custom/jrny/src/lib/actions/courier-response'

// Placeholders on purpose: whoever imports picks the connections, and the webhook secret is pasted in by hand so it never lives in a file.
const NUCLEUS = "{{connections['pick-the-nucleus-connection']}}"
const JRNY = "{{connections['pick-the-jrny-connection']}}"
const now = new Date().toISOString()
const D = "trigger['body']['data']"
const data = (path: string) => `{{${D}${path}}}`

// Each expression is one JS expression the engine evaluates (props-resolver evalInScope); a throw resolves to '', so every lookup is guarded.
const FALLBACK_REASON = 'the step failed before calling Nucleus; see this run in JRNYFLW'
// JRNY leaves line 2 optional and expects the integration to repeat the suburb when there is none (courier-payload.ts).
const orSuburb = (side: string, field: string) => `{{String(${D}['${side}']['${field}'] ?? '').trim() || ${D}['${side}']['suburb']}}`
const SENDER_ADDRESS_1 = orSuburb('sender', 'address2')
const DEST_ADDRESS_2 = orSuburb('deliveryAddress', 'line2')
const HUBS_OK = 'step_4?.ok === true && step_1?.ok === true'
const READY = `{{${HUBS_OK} && String(${D}['courierAccountNumber'] ?? '').trim() !== ''}}`
const NOT_READY_STEP = `{{${HUBS_OK} ? 'Create waybill' : 'Find hub code'}}`
const reasonOf = (step: string) => `(${step}?.error?.message || '${FALLBACK_REASON}')`
const NOT_READY_MESSAGE = `{{step_4?.ok !== true ? 'Find hub code: sender address: ' + ${reasonOf('step_4')} : step_1?.ok !== true ? 'Find hub code: delivery address: ' + ${reasonOf('step_1')} : 'Create waybill: the courier account number is missing in JRNY'}}`
const hubWarning = ({ step, side }: { step: string; side: string }) => `${step}?.output?.matchedOn === 'fallback' ? '${side} hub not found, booked with hub UNK: ' + ${step}.output.reason : ''`
const HUB_WARNING_LIST = `${hubWarning({ step: 'step_4', side: 'Sender' })}, ${hubWarning({ step: 'step_1', side: 'Delivery' })}`
const HUB_WARNINGS = `{{[${HUB_WARNING_LIST}].filter(Boolean).join(' ')}}`
const EXISTS_WARNINGS = `{{['Waybill already existed in Nucleus, parcels not checked.', ${HUB_WARNING_LIST}].filter(Boolean).join(' ')}}`
const ADDRESS_HINT = ' Fix the address in JRNY: Sender Address 1 to 4 = warehouse address line 2 (or suburb), address line 1, suburb, city; Receiver Address 1 to 4 = delivery line 1, line 2 (or suburb), suburb, city.'
const HEADER_FAILED = `{{'Create waybill: ' + ${reasonOf('step_2')} + (step_2?.error?.code === 'NUCLEUS_FIELDS_TOO_LONG' ? '${ADDRESS_HINT}' : '')}}`
const PARCELS_FAILED = `{{'Add parcels: ' + ${reasonOf('step_3')}.replace(/\\.$/, '') + '. The waybill was created in Nucleus but its parcels were not: add them in Nucleus by hand, because a resend will mark this booked without adding them.'}}`

function piece({ name, displayName, pieceName, actionName, input, continueOnFailure }: { name: string; displayName: string; pieceName: string; actionName: string; input: Record<string, unknown>; continueOnFailure: boolean }) {
    const propertySettings = Object.fromEntries(Object.keys(input).filter((key) => key !== 'auth').map((key) => [key, { type: 'MANUAL' }]))
    return {
        name, displayName, type: 'PIECE', valid: false, skip: false, lastUpdatedDate: now,
        settings: { pieceName, pieceVersion: '0.1.0', actionName, input, propertySettings, sampleData: {}, errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: continueOnFailure } } },
    }
}

function router({ name, displayName, branchName, conditions, child, otherwise }: { name: string; displayName: string; branchName: string; conditions: unknown[]; child: unknown; otherwise: unknown }) {
    return {
        name, displayName, type: 'ROUTER', valid: true, skip: false, lastUpdatedDate: now,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: [{ branchType: 'CONDITION', branchName, conditions: [conditions] }, { branchType: 'FALLBACK', branchName: 'Otherwise' }] },
        children: [child, otherwise],
    }
}

// The engine checks required props before a piece's own Continue handling runs, so engine-level continue keeps even that failure reportable.
function nucleus({ name, displayName, actionName, input }: { name: string; displayName: string; actionName: string; input: Record<string, unknown> }) {
    return piece({ name, displayName, pieceName: '@jrnyflw/nucleus', actionName, input: { auth: NUCLEUS, ...input, onFailure: 'continue' }, continueOnFailure: true })
}

// A failed JRNY update must fail the run: it is the one outcome JRNY cannot be told about.
function courier({ name, displayName, input }: { name: string; displayName: string; input: Record<string, unknown> }) {
    return piece({ name, displayName, pieceName: '@jrnyflw/jrny', actionName: 'courier_response', input: { auth: JRNY, dispatchNumber: data("['dispatchNumber']"), waybillNumber: data("['waybillNumber']"), ...input, onFailure: 'stop' }, continueOnFailure: false })
}

const hubInput = (side: string) => ({
    city: data(`['${side}']['city']`), suburb: data(`['${side}']['suburb']`), province: data(`['${side}']['province']`), postalCode: data(`['${side}']['postalCode']`), ifNotFound: 'unknown',
})

const booked = courier({ name: 'step_10', displayName: 'Booked', input: { courierStatus: 'booked', hubCode: "{{step_1['output']['hubCode']}}", trackingUrl: "{{step_2['output']['trackingUrl']}}", courierWarning: HUB_WARNINGS } })
const parcelsFailed = courier({ name: 'step_11', displayName: 'Failed: parcels', input: { courierStatus: 'failed', failedStep: 'Add parcels', errorMessage: PARCELS_FAILED } })
const bookedExisting = courier({ name: 'step_13', displayName: 'Booked (already in Nucleus)', input: { courierStatus: 'booked', hubCode: "{{step_1['output']['hubCode']}}", courierWarning: EXISTS_WARNINGS } })
const headerFailed = courier({ name: 'step_14', displayName: 'Failed: waybill', input: { courierStatus: 'failed', failedStep: 'Create waybill', errorMessage: HEADER_FAILED } })
const notReady = courier({ name: 'step_7', displayName: 'Failed: not booked', input: { courierStatus: 'failed', failedStep: NOT_READY_STEP, errorMessage: NOT_READY_MESSAGE } })

const parcels = {
    ...nucleus({ name: 'step_3', displayName: 'Add parcels', actionName: 'create_waybill_import_dims_and_detail', input: { waybillNo: data("['waybillNumber']"), itemsField: 'one', cartonsJson: data("['cartons']"), parcels: [] } }),
    nextAction: router({ name: 'step_9', displayName: 'Parcels added?', branchName: 'Booked', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_3['ok']}}" }], child: booked, otherwise: parcelsFailed }),
}

const alreadyExists = router({
    name: 'step_12', displayName: 'Already in Nucleus?', branchName: 'Booked anyway',
    // Nucleus gives no code for a duplicate waybill; its message is the only signal.
    conditions: [{ operator: 'TEXT_CONTAINS', firstValue: "{{step_2['error']['message']}}", secondValue: 'already exists', caseSensitive: false }],
    child: bookedExisting, otherwise: headerFailed,
})

const header = {
    ...nucleus({
        name: 'step_2', displayName: 'Create waybill', actionName: 'create_waybill_import_header',
        input: {
            waybillNo: data("['waybillNumber']"), waybillDate: data("['waybillDate']"), servCode: data("['serviceCode']"),
            noParcels: data("['totalCartons']"), weight: data("['totalGrossWeightKg']"), accNum: data("['courierAccountNumber']"),
            accName: data("['sender']['name']"), accTelNo: data("['sender']['telephone']"),
            // Sender lines 1 and 2 are swapped on purpose: kept from the flow this replaces.
            accAddress1: SENDER_ADDRESS_1, accAddress2: data("['sender']['address1']"), accAddress3: data("['sender']['suburb']"), accAddress4: data("['sender']['city']"), accPostalCode: data("['sender']['postalCode']"),
            origCode: "{{step_4['output']['hubCode']}}", destCode: "{{step_1['output']['hubCode']}}",
            destName: data("['customerName']"), contactName: data("['deliveryAddress']['contactName']"), contactTelNo: data("['deliveryAddress']['contactPhone']"), destAccNum: data("['deliveryAddress']['addressCode']"),
            destAddress1: data("['deliveryAddress']['line1']"), destAddress2: DEST_ADDRESS_2, destAddress3: data("['deliveryAddress']['suburb']"), destAddress4: data("['deliveryAddress']['city']"), destPostalCode: data("['deliveryAddress']['postalCode']"),
            reference: data("['customerPONumber']"), customerPONumber: data("['customerPONumber']"),
        },
    }),
    nextAction: router({ name: 'step_8', displayName: 'Header created?', branchName: 'Add parcels', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: "{{step_2['ok']}}" }], child: parcels, otherwise: alreadyExists }),
}

const deliveryHub = {
    ...nucleus({ name: 'step_1', displayName: 'Delivery hub', actionName: 'find_hub_code_for_address', input: hubInput('deliveryAddress') }),
    nextAction: router({ name: 'step_6', displayName: 'Ready to book?', branchName: 'Book it', conditions: [{ operator: 'BOOLEAN_IS_TRUE', firstValue: READY }], child: header, otherwise: notReady }),
}

const senderHub = { ...nucleus({ name: 'step_4', displayName: 'Sender hub', actionName: 'find_hub_code_for_address', input: hubInput('sender') }), nextAction: deliveryHub }

const trigger = {
    name: 'trigger', displayName: 'JRNY: ready for courier', type: 'PIECE_TRIGGER', valid: false, lastUpdatedDate: now,
    settings: {
        pieceName: '@activepieces/piece-webhook', pieceVersion: '0.1.33', triggerName: 'catch_webhook',
        // JRNY signs X-Webhook-Signature with HMAC-SHA256 hex and no prefix (webhook-delivery.processor.ts). Paste the secret after import.
        input: { authType: 'hmac', authFields: { hmacHeaderName: 'x-webhook-signature', hmacSecret: '', hmacAlgorithm: 'sha256', hmacEncoding: 'hex', hmacSignaturePrefix: '' } },
        propertySettings: { authType: { type: 'MANUAL' }, authFields: { type: 'MANUAL' } }, sampleData: {},
    },
    nextAction: senderHub,
}

const template = {
    name: 'JRNY Dispatch → Nucleus Booking', type: 'SHARED', summary: '',
    description: 'Books a JRNY dispatch with Nucleus when JRNY says it is ready for the courier, and reports the outcome to JRNY: booked (with a warning when it needs a look) or failed with the step and reason.',
    tags: [], blogUrl: '', metadata: { externalId: 'nucleusBookingV1xxxxxxxx' }, author: 'JRNYFLW Admin', categories: [],
    pieces: ['@activepieces/piece-webhook', '@jrnyflw/nucleus', '@jrnyflw/jrny'], status: 'PUBLISHED',
    flows: [{ displayName: 'JRNY Dispatch → Nucleus Booking', valid: false, schemaVersion: '20', notes: [], trigger }],
}

const problems: string[] = []
const nucleusSteps = [senderHub, deliveryHub, header, parcels]
const courierSteps = [booked, parcelsFailed, bookedExisting, headerFailed, notReady]
const propsOf: Record<string, string[]> = {
    find_hub_code_for_address: Object.keys(findHubCodeForAddress.props),
    create_waybill_import_header: Object.keys(createWaybillImportHeader.props),
    create_waybill_import_dims_and_detail: Object.keys(createWaybillImportDimsAndDetail.props),
    courier_response: Object.keys(courierResponse.props),
}
for (const step of [...nucleusSteps, ...courierSteps]) {
    const known = propsOf[step.settings.actionName]
    for (const key of Object.keys(step.settings.input).filter((k) => k !== 'auth')) {
        if (!known.includes(key)) problems.push(`${step.name} (${step.settings.actionName}) has no prop ${key}`)
    }
}
for (const step of nucleusSteps) {
    if (step.settings.input.onFailure !== 'continue' || step.settings.errorHandlingOptions.continueOnFailure.value !== true) problems.push(`${step.name} must continue on failure so the failure reaches JRNY`)
}
for (const step of courierSteps) {
    if (step.settings.input.onFailure !== 'stop') problems.push(`${step.name} must stop on failure: a failed JRNY update must fail the run`)
}
const headerInput: Record<string, unknown> = header.settings.input
for (const [key, prop] of Object.entries(createWaybillImportHeader.props)) {
    const value = headerInput[key]
    if (isRecord(prop) && prop['required'] === true && (typeof value !== 'string' || value.trim() === '')) problems.push(`step_2 required prop ${key} has no input`)
}
if (trigger.settings.input.authFields.hmacSecret !== '') problems.push('the webhook secret must be blank in the file')
const json = JSON.stringify(template)
if (/"hmacSecret":"[^"]/.test(json) || /password|bearerToken/i.test(json)) problems.push('the flow file must not carry credentials')

const hubOk = { ok: true, output: { hubCode: 'JNB', matchedOn: 'suburb' } }
const goodData = { courierAccountNumber: 'ACC1', sender: { address2: 'Unit 4', suburb: 'Midrand' }, deliveryAddress: { line2: 'Unit 4', suburb: 'Ballito' } }
const run = (overrides: Record<string, unknown>, body: Record<string, unknown> = goodData) => ({ trigger: { body: { data: body } }, step_1: hubOk, step_2: undefined, step_3: undefined, step_4: hubOk, ...overrides })
const cases: { name: string; expression: string; scope: Record<string, unknown>; expected: unknown }[] = [
    { name: 'blank line 2 uses the suburb', expression: DEST_ADDRESS_2, scope: run({}, { ...goodData, deliveryAddress: { line2: '  ', suburb: 'Ballito' } }), expected: 'Ballito' },
    { name: 'line 2 present is kept', expression: DEST_ADDRESS_2, scope: run({}), expected: 'Unit 4' },
    { name: 'blank sender address 2 uses the suburb', expression: SENDER_ADDRESS_1, scope: run({}, { ...goodData, sender: { address2: null, suburb: 'Midrand' } }), expected: 'Midrand' },
    { name: 'all good is ready', expression: READY, scope: run({}), expected: true },
    { name: 'all good has no warning', expression: HUB_WARNINGS, scope: run({}), expected: '' },
    { name: 'missing account is not ready', expression: READY, scope: run({}, { ...goodData, courierAccountNumber: null }), expected: false },
    { name: 'missing account fails at Create waybill', expression: NOT_READY_STEP, scope: run({}, { ...goodData, courierAccountNumber: null }), expected: 'Create waybill' },
    { name: 'missing account message', expression: NOT_READY_MESSAGE, scope: run({}, { ...goodData, courierAccountNumber: null }), expected: 'Create waybill: the courier account number is missing in JRNY' },
    { name: 'delivery hub call failed', expression: NOT_READY_MESSAGE, scope: run({ step_1: { ok: false, error: { message: 'Nucleus error: timeout' } } }), expected: 'Find hub code: delivery address: Nucleus error: timeout' },
    { name: 'delivery hub call failed step', expression: NOT_READY_STEP, scope: run({ step_1: { ok: false, error: { message: 'Nucleus error: timeout' } } }), expected: 'Find hub code' },
    { name: 'sender hub failed without a message', expression: NOT_READY_MESSAGE, scope: run({ step_4: undefined }), expected: `Find hub code: sender address: ${FALLBACK_REASON}` },
    {
        name: 'UNK on both sides plus already exists', expression: EXISTS_WARNINGS,
        scope: run({ step_4: { ok: true, output: { hubCode: 'UNK', matchedOn: 'fallback', reason: 'R1' } }, step_1: { ok: true, output: { hubCode: 'UNK', matchedOn: 'fallback', reason: 'R2' } } }),
        expected: 'Waybill already existed in Nucleus, parcels not checked. Sender hub not found, booked with hub UNK: R1 Delivery hub not found, booked with hub UNK: R2',
    },
    { name: 'already exists alone', expression: EXISTS_WARNINGS, scope: run({}), expected: 'Waybill already existed in Nucleus, parcels not checked.' },
    { name: 'delivery UNK on a clean booking', expression: HUB_WARNINGS, scope: run({ step_1: { ok: true, output: { hubCode: 'UNK', matchedOn: 'fallback', reason: 'R2' } } }), expected: 'Delivery hub not found, booked with hub UNK: R2' },
    { name: 'header never ran', expression: HEADER_FAILED, scope: run({}), expected: `Create waybill: ${FALLBACK_REASON}` },
    { name: 'header refused by Nucleus', expression: HEADER_FAILED, scope: run({ step_2: { ok: false, error: { message: 'Nucleus error: ERROR - bad' } } }), expected: 'Create waybill: Nucleus error: ERROR - bad' },
    { name: 'parcels refused', expression: PARCELS_FAILED, scope: run({ step_3: { ok: false, error: { message: 'Nucleus error: ERROR - bad.' } } }), expected: 'Add parcels: Nucleus error: ERROR - bad. The waybill was created in Nucleus but its parcels were not: add them in Nucleus by hand, because a resend will mark this booked without adding them.' },
]
for (const c of cases) {
    const actual = evaluate({ expression: c.expression, scope: c.scope })
    if (actual !== c.expected) problems.push(`expression check "${c.name}": expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(actual)}`)
}
const tooLong = String(evaluate({ expression: HEADER_FAILED, scope: run({ step_2: { ok: false, error: { message: 'Too long for Nucleus', code: 'NUCLEUS_FIELDS_TOO_LONG' } } }) }))
if (!tooLong.startsWith('Create waybill: Too long for Nucleus') || !tooLong.includes('Fix the address in JRNY')) problems.push(`expression check "address too long": got ${JSON.stringify(tooLong)}`)

const parsed = SharedTemplate.safeParse(template)
if (!parsed.success) problems.push(JSON.stringify(parsed.error.issues, null, 2))
if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
}
writeFileSync(process.argv[2], JSON.stringify(template, null, 2) + '\n')
console.log('valid, written to', process.argv[2])

// Mirrors the engine: the text between {{ and }} is one expression over the run's state, and a throw resolves to ''.
function evaluate({ expression, scope }: { expression: string; scope: Record<string, unknown> }): unknown {
    const match = /^\{\{([\s\S]*)\}\}$/.exec(expression)
    if (match === null) return undefined
    try {
        return new Function(...Object.keys(scope), `return (${match[1]})`)(...Object.values(scope))
    }
    catch {
        return ''
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
