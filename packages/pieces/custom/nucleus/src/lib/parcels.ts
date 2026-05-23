function packParcels(parcels: Parcel[]): Record<string, string> {
    const join = (pick: (p: Parcel) => number | string) => parcels.map(pick).join(',');
    return {
        PARCELNOS: join((p) => p.parcelNo),
        ITEMS: join((p) => p.items),
        LENGTHS: join((p) => p.length),
        WIDTHS: join((p) => p.width),
        HEIGHTS: join((p) => p.height),
        WEIGHTS: join((p) => p.weight),
        NUMPARCEL: String(parcels.length),
    };
}

export const nucleusParcels = { packParcels };

type Parcel = { parcelNo: string; items: number; length: number; width: number; height: number; weight: number };
