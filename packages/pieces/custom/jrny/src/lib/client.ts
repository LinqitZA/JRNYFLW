import { AuthenticationType, HttpError, HttpMethod } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
import { JrnyAuth } from './auth';

export class JrnyApiError extends Error {
  public readonly httpStatus: number;
  public readonly errorCode: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(httpStatus: number, envelope: JrnyErrorEnvelope) {
    super(describeEnvelope({ httpStatus, envelope }));
    this.name = 'JrnyApiError';
    this.httpStatus = httpStatus;
    this.errorCode = envelope.error.code;
    this.details = envelope.error.details;
    this.requestId = envelope.requestId;
  }
}

async function request<T>({ trace, auth, method, path, query, body }: JrnyRequest): Promise<T> {
  const response = await trace.send<T>({
    request: {
      method,
      url: joinUrl(auth.baseUrl, path),
      authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
      headers: { 'Content-Type': 'application/json' },
      queryParams: query,
      body,
    },
  });
  return response.body;
}

async function callJrny<T>({ trace, auth, method, path, body }: CallJrnyParams): Promise<T> {
  const url = `${trimTrailingSlash(auth.baseUrl)}${path}`;
  try {
    const response = await trace.send<T>({
      request: {
        method,
        url,
        authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    });
    return response.body;
  } catch (err) {
    if (err instanceof HttpError) {
      const status = err.response?.status ?? 0;
      const responseBody = err.response?.body;
      if (isJrnyErrorEnvelope(responseBody)) {
        throw new JrnyApiError(status, responseBody);
      }
      throw new Error(`JRNY API call to ${method} ${url} failed with HTTP ${status}: ${stringifyForLog(responseBody)}`);
    }
    throw err;
  }
}

// Steps only surface the error message, so details and the request ID must be in it for anyone to see them in run history.
function describeEnvelope({ httpStatus, envelope }: { httpStatus: number; envelope: JrnyErrorEnvelope }): string {
  const details = envelope.error.details === undefined ? '' : ` Details: ${stringifyForLog(envelope.error.details)}`;
  const requestId = envelope.requestId === undefined ? '' : ` (request ${envelope.requestId})`;
  return `JRNY API error ${httpStatus} ${envelope.error.code}: ${envelope.error.message}${details}${requestId}`;
}

function secretsOf(auth: JrnyAuth): string[] {
  return [auth.bearerToken];
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isJrnyErrorEnvelope(value: unknown): value is JrnyErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error: unknown = value.error;
  if (typeof error !== 'object' || error === null || !('code' in error) || !('message' in error)) return false;
  return typeof error.code === 'string' && typeof error.message === 'string';
}

function stringifyForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const jrnyClient = { callJrny, request, joinUrl, secretsOf };

type JrnyRequest = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

type CallJrnyParams = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  path: string;
  body?: unknown;
};

export type JrnyErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};
