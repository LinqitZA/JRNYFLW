import { HttpError, HttpMethod, HttpRequest } from '@activepieces/pieces-common';
import { pieceTrace, Tracer } from '@jrnyflw/piece-trace';

async function getToken({ trace, auth }: { trace: Tracer; auth: MsGraphMailAuth }): Promise<string> {
    try {
        const response = await trace.send<unknown>({ request: tokenRequest({ auth, secret: auth.clientSecret }), bodyForTrace: tokenForm({ auth, secret: pieceTrace.redacted }) });
        return accessTokenOf(response.body);
    } catch (err) {
        throw new Error(describeTokenFailure(err));
    }
}

async function sendMail({ trace, auth, token, payload }: { trace: Tracer; auth: MsGraphMailAuth; token: string; payload: unknown }): Promise<void> {
    const sender = auth.senderMailbox.trim();
    try {
        await trace.send<unknown>({
            request: {
                method: HttpMethod.POST,
                url: `${GRAPH_BASE_URL}/users/${encodeURIComponent(sender)}/sendMail`,
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: payload,
            },
        });
    } catch (err) {
        if (!(err instanceof HttpError)) {
            throw err;
        }
        throw graphFailure({ err, sender });
    }
}

// The token form carries the secret URL-encoded, so an error page that echoes the form shows that spelling instead.
function secretsOf(auth: MsGraphMailAuth): string[] {
    return [...new Set([auth.clientSecret, encodeURIComponent(auth.clientSecret)])];
}

function tokenRequest({ auth, secret }: { auth: MsGraphMailAuth; secret: string }): HttpRequest {
    return {
        method: HttpMethod.POST,
        url: `https://login.microsoftonline.com/${encodeURIComponent(auth.tenantId.trim())}/oauth2/v2.0/token`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenForm({ auth, secret }),
    };
}

function tokenForm({ auth, secret }: { auth: MsGraphMailAuth; secret: string }): string {
    // The redaction marker is added unencoded so the trace reads client_secret=[redacted].
    const encodedSecret = secret === pieceTrace.redacted ? secret : encodeURIComponent(secret);
    return [
        'grant_type=client_credentials',
        `client_id=${encodeURIComponent(auth.clientId.trim())}`,
        `client_secret=${encodedSecret}`,
        `scope=${encodeURIComponent(GRAPH_SCOPE)}`,
    ].join('&');
}

function accessTokenOf(body: unknown): string {
    if (typeof body !== 'object' || body === null || !('access_token' in body) || typeof body.access_token !== 'string') {
        throw new Error('the token response had no access_token');
    }
    return body.access_token;
}

// Microsoft's AADSTS codes say which of the connection's values is wrong; people otherwise only see "invalid_request".
function describeTokenFailure(err: unknown): string {
    if (err instanceof HttpError) {
        const body: unknown = err.response.body;
        const codes = aadstsCodesOf(body);
        if (codes.some((code) => CLIENT_REJECTED.includes(code)) || (isRecord(body) && body['error'] === 'invalid_client')) {
            return 'Microsoft rejected the client ID or secret';
        }
        if (codes.some((code) => TENANT_UNKNOWN.includes(code))) {
            return 'Microsoft does not recognise this tenant ID';
        }
        if (isBlank(body)) {
            return `Could not get a token from Microsoft: ${noResponse(err.response.status)}`;
        }
        return `Could not get a token from Microsoft: HTTP ${err.response.status}: ${JSON.stringify(body)}`;
    }
    return `Could not get a token from Microsoft: ${err instanceof Error ? err.message : String(err)}`;
}

function aadstsCodesOf(body: unknown): number[] {
    if (!isRecord(body) || !Array.isArray(body['error_codes'])) {
        return [];
    }
    return body['error_codes'].filter((code): code is number => typeof code === 'number');
}

function graphFailure({ err, sender }: { err: HttpError; sender: string }): GraphError {
    const status = err.response.status;
    const body: unknown = err.response.body;
    const code = isRecord(body) && isRecord(body['error']) && typeof body['error']['code'] === 'string' ? body['error']['code'] : undefined;
    if (status === 403) {
        return new GraphError({
            message: `Microsoft refused to send as ${sender}: check the Mail.Send application permission, admin consent and any application access policy`,
            code,
        });
    }
    if (status === 404) {
        return new GraphError({ message: `The sender mailbox ${sender} was not found or has no Exchange Online mailbox`, code });
    }
    if (isBlank(body)) {
        return new GraphError({ message: `Microsoft Graph gave ${noResponse(status)}`, code });
    }
    return new GraphError({ message: `HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`, code });
}

// The HTTP client reports a call that never got an answer (timeout, DNS, blocked egress) as HTTP 500 with no body.
function noResponse(status: number): string {
    return `no response body (HTTP ${status}, or Microsoft could not be reached)`;
}

function isBlank(body: unknown): boolean {
    return body === undefined || body === null || body === '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class GraphError extends Error {
    public readonly code?: string;

    constructor({ message, code }: { message: string; code: string | undefined }) {
        super(message);
        this.name = 'GraphError';
        this.code = code;
    }
}

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
// 7000215 wrong secret, 7000222 expired secret, 700016 unknown client ID.
const CLIENT_REJECTED = [7000215, 7000222, 700016];
// 90002 tenant not found, 900023 not a valid tenant identifier.
const TENANT_UNKNOWN = [90002, 900023];

export const msGraphClient = { getToken, sendMail, secretsOf };

export type MsGraphMailAuth = { tenantId: string; clientId: string; clientSecret: string; senderMailbox: string };
