function confirmation(body: unknown): string | null {
    const text = bodyText(body);
    if (!CONFIRMATION.test(text)) {
        return null;
    }
    const inner = /<string[^>]*>([\s\S]*?)<\/string>/.exec(text);
    return oneLine(decodeEntities(inner === null ? text : inner[1]));
}

function unconfirmed({ status, body }: ResponseParams): string {
    const text = oneLine(bodyText(body));
    return cap(`Shoprite answered ${status} but did not confirm the invoice: ${text === '' ? '(empty body)' : text}. Check in Shoprite before resending.`);
}

function failure({ status, body }: ResponseParams): string {
    const text = bodyText(body);
    const message = oneLine(decodeEntities(errorMessageOf({ body, text })));
    if (message !== '') {
        return cap(message);
    }
    if (text.trim() === '') {
        return `HTTP ${status} with no response body`;
    }
    return cap(`HTTP ${status}: ${oneLine(text)}`);
}

function noAnswer(): string {
    return 'No answer from Shoprite (the connection failed or timed out, or it returned an empty server error). Check in Shoprite before resending.';
}

// Shoprite's .NET errors put the readable part in Message; ExceptionMessage repeats it and the stack trace means nothing to whoever fixes the invoice.
function errorMessageOf({ body, text }: { body: unknown; text: string }): string {
    const xml = /<Message>([\s\S]*?)<\/Message>/.exec(text);
    if (xml !== null) {
        return xml[1];
    }
    if (typeof body === 'object' && body !== null) {
        const field = Object.entries(body).find(([key]) => key === 'Message')?.[1];
        if (typeof field === 'string') {
            return field;
        }
    }
    return '';
}

function bodyText(body: unknown): string {
    if (body === undefined || body === null) {
        return '';
    }
    return typeof body === 'string' ? body : JSON.stringify(body);
}

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

// Shoprite's messages carry line breaks both as real CR LF and as literal "\r\n" text.
function oneLine(text: string): string {
    return text.replace(/\\r\\n|\\r|\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cap(text: string): string {
    return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…` : text;
}

// One invoice goes per POST, so only a count of one confirms it; "0 records were successfully inserted" did not land.
const CONFIRMATION = /\b1 records? (?:was|were) successfully inserted/i;
const MAX_MESSAGE_CHARS = 1000;

export const invoiceResponse = { confirmation, unconfirmed, failure, noAnswer };

type ResponseParams = { status: number; body: unknown };
