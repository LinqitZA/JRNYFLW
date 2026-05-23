/// <reference types="vitest/globals" />
import { nucleusParcels } from '../src/lib/parcels';

describe('packParcels', () => {
    test('joins parcel rows into the parallel comma-separated arrays the API expects', () => {
        const out = nucleusParcels.packParcels([
            { parcelNo: 'P1', items: 1, length: 10, width: 11, height: 12, weight: 5 },
            { parcelNo: 'P2', items: 2, length: 20, width: 21, height: 22, weight: 6 },
        ]);
        expect(out).toEqual({
            PARCELNOS: 'P1,P2',
            ITEMS: '1,2',
            LENGTHS: '10,20',
            WIDTHS: '11,21',
            HEIGHTS: '12,22',
            WEIGHTS: '5,6',
            NUMPARCEL: '2',
        });
    });
});
