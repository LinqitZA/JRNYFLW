import { createAction, Property } from '@activepieces/pieces-framework'
import { MappingSpecSchema, mapperEngine } from '@activepieces/shared'

export const applyMapping = createAction({
    name: 'apply_mapping',
    displayName: 'Apply Mapping',
    description:
        'Transform the source data into the target shape using a mapping spec. Supports reshape (single object), per-row (array), and grouped (N→1 batching by key) modes.',
    errorHandlingOptions: {
        continueOnFailure: { hide: true },
        retryOnFailure: { hide: true },
    },
    props: {
        sourceData: Property.Json({
            displayName: 'Source Data',
            description: 'The upstream step output to transform. A single object, or an array of rows.',
            required: true,
        }),
        mappingSpec: Property.Json({
            displayName: 'Mapping Spec',
            description: 'The declarative mapping spec (specVersion 1). Authored visually in the mapper UI.',
            required: true,
        }),
    },
    async run(context) {
        const spec = MappingSpecSchema.parse(context.propsValue.mappingSpec)
        return mapperEngine.runMapping({ sourceData: context.propsValue.sourceData, spec })
    },
})
