// Nucleus reads the list up to the first space, so "W1, W2" silently returns only W1.
function parseWaybillList(text: string): string[] {
    const seen = new Set<string>();
    const waybills: string[] = [];
    for (const raw of text.split(/[\s,;]+/)) {
        const waybill = raw.trim().toUpperCase();
        if (waybill !== '' && !seen.has(waybill)) {
            seen.add(waybill);
            waybills.push(waybill);
        }
    }
    return waybills;
}

function toPodStatuses({ requested, rows, links }: { requested: string[]; rows: unknown[]; links: PodLinks }): PodStatusResult {
    const byWaybill = new Map<string, PodRow>();
    for (const row of rows) {
        if (isPodRow(row)) {
            byWaybill.set(row.waybill.trim().toUpperCase(), row);
        }
    }
    const waybills: PodStatus[] = [];
    const notFound: string[] = [];
    for (const waybill of requested) {
        const row = byWaybill.get(waybill.toUpperCase());
        if (row) {
            waybills.push(toPodStatus({ row, links }));
        } else {
            notFound.push(waybill);
        }
    }
    return { waybills, notFound };
}

function trackingUrlFor({ links, waybill }: { links: PodLinks; waybill: string }): string | null {
    return linkFor({ base: links.trackingUrl, waybill });
}

function rowsOf(body: unknown): unknown[] {
    if (typeof body !== 'object' || body === null || !('ResultSets' in body) || !Array.isArray(body.ResultSets)) {
        return [];
    }
    const firstSet: unknown = body.ResultSets[0];
    return Array.isArray(firstSet) ? firstSet : [];
}

function toPodStatus({ row, links }: { row: PodRow; links: PodLinks }): PodStatus {
    const waybillNumber = row.waybill.trim().toUpperCase();
    const delivered = nonBlank(row.Date) !== null;
    return {
        waybillNumber,
        delivered,
        podSignedBy: delivered ? nonBlank(row.Signature) : null,
        podSignedAt: delivered ? toSastTimestamp({ date: row.Date, time: row.Time }) : null,
        manifestDate: toIsoDate(row.ManifestDate),
        noParcels: typeof row.NoParcels === 'number' ? row.NoParcels : null,
        grvNumber: nonBlank(row.GRVNo),
        trackingUrl: linkFor({ base: links.trackingUrl, waybill: waybillNumber }),
        podUrl: delivered ? linkFor({ base: links.podUrl, waybill: waybillNumber }) : null,
    };
}

// Nucleus gives POD dates as "YYYY/MM/DD" and times as "HH:mm" in South African time, with no zone.
function toSastTimestamp({ date, time }: { date: unknown; time: unknown }): string | null {
    const dateMatch = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(nonBlank(date) ?? '');
    if (!dateMatch) {
        return null;
    }
    const timeMatch = /^(\d{1,2}):(\d{2})/.exec(nonBlank(time) ?? '');
    const hours = timeMatch ? timeMatch[1].padStart(2, '0') : '00';
    const minutes = timeMatch ? timeMatch[2] : '00';
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${hours}:${minutes}:00${SAST_OFFSET}`;
}

function toIsoDate(value: unknown): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(nonBlank(value) ?? '');
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function linkFor({ base, waybill }: { base: string | undefined; waybill: string }): string | null {
    const trimmed = (base ?? '').trim();
    return trimmed === '' ? null : `${trimmed}${encodeURIComponent(waybill)}`;
}

function nonBlank(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isPodRow(value: unknown): value is PodRow {
    return typeof value === 'object' && value !== null && 'waybill' in value && typeof value.waybill === 'string';
}

const SAST_OFFSET = '+02:00';

export const nucleusPodStatus = { parseWaybillList, toPodStatuses, trackingUrlFor, rowsOf };

type PodRow = { waybill: string; Signature?: unknown; Date?: unknown; Time?: unknown; GRVNo?: unknown; NoParcels?: unknown; ManifestDate?: unknown };

export type PodLinks = { trackingUrl?: string; podUrl?: string };
export type PodStatus = {
    waybillNumber: string;
    delivered: boolean;
    podSignedBy: string | null;
    podSignedAt: string | null;
    manifestDate: string | null;
    noParcels: number | null;
    grvNumber: string | null;
    trackingUrl: string | null;
    podUrl: string | null;
};
export type PodStatusResult = { waybills: PodStatus[]; notFound: string[] };
