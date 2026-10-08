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

function parseImportParcels(rows: unknown[]): ImportParcel[] {
    return rows.map((row, index) => {
        if (typeof row !== 'object' || row === null) {
            throw new Error(`Parcel ${index + 1} is not a valid parcel row`);
        }
        const record: Record<string, unknown> = { ...row };
        const parcelNo = record['parcelNo'];
        return {
            parcelNo: typeof parcelNo === 'string' && parcelNo.trim() !== '' ? parcelNo.trim() : undefined,
            items: toNumber({ value: record['items'], field: 'Items', index }),
            length: toNumber({ value: record['length'], field: 'Length', index }),
            width: toNumber({ value: record['width'], field: 'Width', index }),
            height: toNumber({ value: record['height'], field: 'Height', index }),
            kgs: toNumber({ value: record['kgs'], field: 'Weight', index }),
        };
    });
}

function parseJrnyCartons({ value, itemsField }: { value: unknown; itemsField: JrnyItemsField }): ImportParcel[] {
    const cartons = typeof value === 'string' ? parseJson(value) : value;
    if (!Array.isArray(cartons)) {
        throw new Error('Cartons (JSON) must be an array of JRNY cartons');
    }
    const rows = cartons.map((carton, index) => {
        if (typeof carton !== 'object' || carton === null) {
            throw new Error(`Carton ${index + 1} is not a valid carton`);
        }
        const record: Record<string, unknown> = { ...carton };
        return {
            parcelNo: record['barcode'],
            items: itemsField === 'one' ? 1 : record[itemsField],
            length: record['lengthCm'],
            width: record['widthCm'],
            height: record['heightCm'],
            kgs: record['grossWeightKg'],
        };
    });
    return parseImportParcels(rows);
}

function packImportParcels(parcels: ImportParcel[]): Record<string, string> {
    if (parcels.length === 0) {
        throw new Error('At least one parcel is required');
    }
    const join = (pick: (p: ImportParcel) => number) => parcels.map(pick).join(',');
    const parcelNos = parcels.map((p) => p.parcelNo);
    const hasAnyParcelNo = parcelNos.some((n) => n !== undefined);
    if (hasAnyParcelNo && parcelNos.some((n) => n === undefined)) {
        // The API matches ParcelNos to the dimension arrays by position, so a partial list would misalign them.
        throw new Error('Parcel No must be set on every parcel or on none');
    }
    return {
        PcsCount: String(parcels.length),
        Items: join((p) => p.items),
        Length: join((p) => p.length),
        Width: join((p) => p.width),
        Height: join((p) => p.height),
        Kgs: join((p) => p.kgs),
        ParcelNos: hasAnyParcelNo ? parcelNos.join(',') : '',
    };
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Cartons (JSON) is not valid JSON');
    }
}

function toNumber({ value, field, index }: { value: unknown; field: string; index: number }): number {
    const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!Number.isFinite(num)) {
        throw new Error(`Parcel ${index + 1}: ${field} must be a number`);
    }
    return num;
}

export const nucleusParcels = { packParcels, parseImportParcels, parseJrnyCartons, packImportParcels };

type Parcel = { parcelNo: string; items: number; length: number; width: number; height: number; weight: number };
type JrnyItemsField = 'one' | 'unitsPacked' | 'itemCount';
type ImportParcel = { parcelNo: string | undefined; items: number; length: number; width: number; height: number; kgs: number };
