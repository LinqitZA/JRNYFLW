function findTooLong({ fields }: { fields: { label: string; value: string }[] }): TooLongField[] {
    return fields
        .filter((field) => field.value.length > NUCLEUS_ADDRESS_MAX_LENGTH)
        .map((field) => ({ label: field.label, length: field.value.length, value: field.value }));
}

function describeTooLong(fields: TooLongField[]): string {
    const listed = fields.map((field) => `${field.label} is ${field.length}: '${field.value}'`).join('; ');
    return `Too long for Nucleus (max ${NUCLEUS_ADDRESS_MAX_LENGTH} characters): ${listed}`;
}

export const nucleusFieldLengths = { findTooLong };

// Nucleus reports only the first column it would truncate, so one error naming every long field saves a fix-and-resend round per field.
export class FieldsTooLongError extends Error {
    readonly code = 'NUCLEUS_FIELDS_TOO_LONG';

    constructor(fields: TooLongField[]) {
        super(describeTooLong(fields));
        this.name = 'FieldsTooLongError';
    }
}

export const NUCLEUS_ADDRESS_MAX_LENGTH = 50;

export type TooLongField = { label: string; length: number; value: string };
