import {
    FlowActionType,
    flowOperations,
    FlowOperationType,
    FlowTrigger,
    FlowTriggerType,
    FlowVersion,
    FlowVersionState,
    PropertyExecutionType,
} from '../../src'

describe('trigger sample data across versions', () => {
    it('keeps the published trigger sample when a new draft is imported from it', () => {
        const draft = flowOperations.apply(emptyVersion(), {
            type: FlowOperationType.IMPORT_FLOW,
            request: {
                displayName: 'Courier',
                trigger: webhookTrigger({ sampleDataFileId: 'published-sample', lastTestDate: '2026-09-28T12:51:43.881Z' }),
                schemaVersion: null,
                notes: [],
            },
        })

        expect(triggerSampleData(draft)).toEqual(expect.objectContaining({ sampleDataFileId: 'published-sample', lastTestDate: expect.any(String) }))
        expect(draft.trigger.nextAction?.settings.sampleData).toEqual({ sampleDataFileId: 'action-sample' })
    })
})

function triggerSampleData(version: FlowVersion): unknown {
    return version.trigger.type === FlowTriggerType.PIECE ? version.trigger.settings.sampleData : undefined
}

function webhookTrigger(sampleData: { sampleDataFileId: string, lastTestDate: string }): FlowTrigger {
    return {
        name: 'trigger',
        displayName: 'Catch Webhook',
        type: FlowTriggerType.PIECE,
        valid: true,
        lastUpdatedDate: '2026-09-28T12:51:43.881Z',
        settings: {
            pieceName: '@activepieces/piece-webhook',
            pieceVersion: '0.1.0',
            triggerName: 'catch_webhook',
            input: {},
            propertySettings: {},
            sampleData,
        },
        nextAction: {
            name: 'step_1',
            displayName: 'Find Hub Code for Address',
            type: FlowActionType.PIECE,
            valid: true,
            settings: {
                pieceName: '@jrnyflw/nucleus',
                pieceVersion: '0.0.4',
                actionName: 'find_hub_code_for_address',
                input: { suburb: '{{trigger.body.data.sender.suburb}}' },
                propertySettings: { suburb: { type: PropertyExecutionType.MANUAL } },
                sampleData: { sampleDataFileId: 'action-sample' },
            },
        },
    }
}

function emptyVersion(): FlowVersion {
    return {
        id: 'draft-version',
        created: '2026-09-28T12:53:11.086Z',
        updated: '2026-09-28T12:53:11.086Z',
        flowId: 'flow-1',
        updatedBy: '',
        displayName: 'Courier',
        agentIds: [],
        notes: [],
        trigger: {
            name: 'trigger',
            displayName: 'Select Trigger',
            type: FlowTriggerType.EMPTY,
            valid: false,
            lastUpdatedDate: '2026-09-28T12:53:11.086Z',
            settings: {},
        },
        connectionIds: [],
        schemaVersion: null,
        valid: false,
        state: FlowVersionState.DRAFT,
        backupFiles: null,
    }
}

describe('importing a flow without trigger sample data', () => {
    it('leaves the trigger untested', () => {
        const trigger = webhookTrigger({ sampleDataFileId: 'unused', lastTestDate: 'unused' })
        const withoutSample: FlowTrigger = trigger.type === FlowTriggerType.PIECE ? { ...trigger, settings: { ...trigger.settings, sampleData: undefined } } : trigger
        const draft = flowOperations.apply(emptyVersion(), {
            type: FlowOperationType.IMPORT_FLOW,
            request: { displayName: 'Courier', trigger: withoutSample, schemaVersion: null, notes: [] },
        })

        expect(triggerSampleData(draft)).toBeUndefined()
    })
})
