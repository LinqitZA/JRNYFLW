import { PieceAuth, createPiece } from '@activepieces/pieces-framework'
import { PieceCategory } from '@activepieces/shared'
import { applyMapping } from './lib/actions/apply-mapping'

export const mapper = createPiece({
    displayName: 'Mapper',
    description:
        'Reshape one step\'s output into another step\'s input. Map fields, transform values, and batch rows into grouped objects (e.g. Excel line items into quotations) using a declarative mapping spec.',
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/data-mapper.png',
    authors: ['jrnyflw'],
    categories: [PieceCategory.CORE],
    auth: PieceAuth.None(),
    actions: [applyMapping],
    triggers: [],
})
