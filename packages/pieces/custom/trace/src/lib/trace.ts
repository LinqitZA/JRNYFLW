import { HttpError, HttpRequest, HttpResponse, httpClient } from '@activepieces/pieces-common';
import { Property } from '@activepieces/pieces-framework';

async function run<T>({ onFailure, secrets, work }: RunParams<T>): Promise<TraceResult<T>> {
    const sent: SentCall[] = [];
    const tracer: Tracer = {
        send: <R>(params: SendParams) => sendAndRecord<R>({ ...params, sent }),
    };
    const usableSecrets = secrets.filter((secret) => secret.length >= MIN_SECRET_LENGTH);
    try {
        const output = await work(tracer);
        return { ok: true, sent: scrubSent({ sent, secrets: usableSecrets }), output };
    } catch (err) {
        if (isEngineError(err)) {
            throw err;
        }
        const cleanSent = scrubSent({ sent, secrets: usableSecrets });
        const message = scrubText({ text: describeError(err), secrets: usableSecrets });
        if (onFailure === 'continue') {
            const error = { message, status: httpFailureStatus(cleanSent), ...errorFacts({ err, secrets: usableSecrets }) };
            return { ok: false, sent: cleanSent, output: null, error };
        }
        throw new Error(`${message}\nSent: ${JSON.stringify(cleanSent)}`);
    }
}

function onFailureProperty() {
    return Property.StaticDropdown<OnFailure>({
        displayName: 'If the call fails',
        description:
            'Continue makes this step succeed with { ok: false, error } so a Router can handle the failure, and the run shows as successful. To still fail the run, end the failure branch with a step that fails, but not inside a loop, where that stops the remaining items.',
        required: false,
        defaultValue: 'stop',
        options: {
            options: [
                { label: 'Stop the flow', value: 'stop' },
                { label: 'Continue and return the error', value: 'continue' },
            ],
        },
    });
}

async function sendAndRecord<R>({ request, bodyForTrace, sent }: SendParams & { sent: SentCall[] }): Promise<HttpResponse<R>> {
    const startedAt = Date.now();
    const call: SentCall = {
        method: request.method,
        url: request.url,
        query: { ...(request.queryParams ?? {}) },
        headers: traceHeaders(request),
        body: traceBody(bodyForTrace === undefined ? request.body : bodyForTrace),
        status: null,
        durationMs: 0,
    };
    sent.push(call);
    try {
        const response = await httpClient.sendRequest<R>(request);
        call.status = response.status ?? null;
        return response;
    } catch (err) {
        if (err instanceof HttpError) {
            call.status = err.response.status;
        } else {
            call.error = describeError(err);
        }
        throw err;
    } finally {
        call.durationMs = Date.now() - startedAt;
    }
}

function traceHeaders(request: HttpRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
        if (value === undefined) {
            continue;
        }
        headers[name] = REDACTED_HEADERS.includes(name.toLowerCase()) ? REDACTED : [value].flat().join(', ');
    }
    if (request.authentication !== undefined) {
        headers['Authorization'] = REDACTED;
    }
    return headers;
}

function traceBody(body: unknown): unknown {
    if (body === undefined) {
        return null;
    }
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    if (text === undefined || text.length <= MAX_BODY_CHARS) {
        return body;
    }
    return `${text.slice(0, MAX_BODY_CHARS)}…[truncated, ${Math.ceil(text.length / 1024)} KB]`;
}

// HttpError's own message embeds the request body, which for a login holds the password.
function describeError(err: unknown): string {
    if (err instanceof HttpError) {
        const { status, body } = err.response;
        if (body === undefined || body === null || body === '') {
            return `HTTP ${status} with no response body`;
        }
        return `HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
    }
    return err instanceof Error ? err.message : String(err);
}

// A client error can carry an API's error code and details so a Router can branch on them instead of searching the message.
function errorFacts({ err, secrets }: { err: unknown; secrets: string[] }): Pick<TraceError, 'code' | 'codes' | 'details'> {
    if (typeof err !== 'object' || err === null) {
        return {};
    }
    const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
    const codes = 'codes' in err && Array.isArray(err.codes) ? err.codes.filter((c): c is string => typeof c === 'string') : undefined;
    const details = 'details' in err && err.details !== undefined ? scrubValue({ value: err.details, secrets }) : undefined;
    return {
        ...(code === undefined ? {} : { code }),
        ...(codes === undefined ? {} : { codes }),
        ...(details === undefined ? {} : { details }),
    };
}

// Engine infrastructure failures (e.g. the store API) must reach the engine as-is so it records an internal error, not a step failure the flow would report to JRNY.
function isEngineError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'type' in err && err.type === 'ENGINE';
}

function httpFailureStatus(sent: SentCall[]): number | null {
    const last = sent[sent.length - 1];
    return last !== undefined && last.status !== null && last.status >= 400 ? last.status : null;
}

function scrubSent({ sent, secrets }: { sent: SentCall[]; secrets: string[] }): SentCall[] {
    return sent.map((call) => ({
        ...call,
        url: scrubText({ text: call.url, secrets }),
        query: scrubRecord({ record: call.query, secrets }),
        headers: scrubRecord({ record: call.headers, secrets }),
        body: scrubValue({ value: call.body, secrets }),
        ...(call.error === undefined ? {} : { error: scrubText({ text: call.error, secrets }) }),
    }));
}

function scrubRecord({ record, secrets }: { record: Record<string, string>; secrets: string[] }): Record<string, string> {
    return Object.fromEntries(Object.entries(record).map(([key, value]): [string, string] => [key, scrubText({ text: value, secrets })]));
}

function scrubValue({ value, secrets }: { value: unknown; secrets: string[] }): unknown {
    if (typeof value === 'string') {
        return scrubText({ text: value, secrets });
    }
    if (Array.isArray(value)) {
        return value.map((item) => scrubValue({ value: item, secrets }));
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, item]): [string, unknown] => [key, scrubValue({ value: item, secrets })]));
    }
    return value;
}

function scrubText({ text, secrets }: { text: string; secrets: string[] }): string {
    return secrets.reduce((acc, secret) => acc.split(secret).join(REDACTED), text);
}

const REDACTED = '[redacted]';
const REDACTED_HEADERS = ['authorization', 'authentication', 'x-api-key'];
const MAX_BODY_CHARS = 50 * 1024;
// Shorter values would scrub ordinary text such as single letters out of URLs and messages.
const MIN_SECRET_LENGTH = 4;

export const pieceTrace = { run, onFailureProperty, redacted: REDACTED };

type SendParams = { request: HttpRequest; bodyForTrace?: unknown };
type RunParams<T> = { onFailure: unknown; secrets: string[]; work: (trace: Tracer) => Promise<T> };

export type OnFailure = 'stop' | 'continue';
export type Tracer = { send: <R>(params: SendParams) => Promise<HttpResponse<R>> };
export type SentCall = {
    method: string;
    url: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
    status: number | null;
    durationMs: number;
    error?: string;
};
export type TraceError = { message: string; status: number | null; code?: string; codes?: string[]; details?: unknown };
export type TraceResult<T> =
    | { ok: true; sent: SentCall[]; output: T }
    | { ok: false; sent: SentCall[]; output: null; error: TraceError };
