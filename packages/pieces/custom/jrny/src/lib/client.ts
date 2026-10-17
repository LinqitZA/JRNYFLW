import { AuthenticationType, HttpError, HttpMethod, HttpRequest } from '@activepieces/pieces-common';
import { Tracer } from '@jrnyflw/piece-trace';
import { JrnyAuth } from './auth';

export class JrnyApiError extends Error {
  public readonly httpStatus: number;
  public readonly code: string;
  public readonly codes: string[];
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(httpStatus: number, envelope: JrnyErrorEnvelope) {
    super(describeEnvelope({ httpStatus, envelope }));
    this.name = 'JrnyApiError';
    this.httpStatus = httpStatus;
    this.code = envelope.error.code;
    this.codes = [...new Set([envelope.error.code, ...codesIn(envelope.error.details)])];
    this.details = envelope.error.details;
    this.requestId = envelope.requestId;
  }
}

async function request<T>({ trace, auth, method, path, query, body }: JrnyRequest): Promise<T> {
  return send<T>({ trace, auth, method, url: joinUrl(auth.baseUrl, path), query, body });
}

async function callJrny<T>({ trace, auth, method, path, body, headers }: CallJrnyParams): Promise<T> {
  return send<T>({ trace, auth, method, url: `${trimTrailingSlash(auth.baseUrl)}${path}`, body, headers });
}

// A missing record and a route JRNY has not deployed yet both answer 404; to a lookup both mean "not there".
async function find<T>({ trace, auth, path }: { trace: Tracer; auth: JrnyAuth; path: string }): Promise<T | null> {
  const url = joinUrl(auth.baseUrl, path);
  try {
    const response = await trace.send<T>({ request: buildRequest({ auth, method: HttpMethod.GET, url }) });
    return response.body;
  } catch (err) {
    if (err instanceof HttpError && err.response?.status === 404) {
      return null;
    }
    throw toJrnyError({ err, method: HttpMethod.GET, url });
  }
}

async function send<T>({ trace, auth, method, url, query, body, headers }: SendParams): Promise<T> {
  try {
    const response = await trace.send<T>({ request: buildRequest({ auth, method, url, query, body, headers }) });
    return response.body;
  } catch (err) {
    throw toJrnyError({ err, method, url });
  }
}

function buildRequest({ auth, method, url, query, body, headers }: Omit<SendParams, 'trace'>): HttpRequest {
  return {
    method,
    url,
    authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.bearerToken },
    headers: { 'Content-Type': 'application/json', ...headers },
    queryParams: query,
    body,
  };
}

function toJrnyError({ err, method, url }: { err: unknown; method: HttpMethod; url: string }): unknown {
  if (!(err instanceof HttpError)) {
    return err;
  }
  const status = err.response?.status ?? 0;
  const responseBody = err.response?.body;
  if (isJrnyErrorEnvelope(responseBody)) {
    return new JrnyApiError(status, responseBody);
  }
  // The HTTP client reports a call that never got an answer (timeout, DNS, refused) as HTTP 500 with no body.
  if (responseBody === undefined || responseBody === null || responseBody === '') {
    return new Error(`JRNY API call to ${method} ${url} got no response body (HTTP ${status}, or JRNY could not be reached)`);
  }
  return new Error(`JRNY API call to ${method} ${url} failed with HTTP ${status}: ${stringifyForLog(responseBody)}`);
}

// JRNY nests per-line failures (e.g. STOCK_ITEM_NOT_FOUND) inside details, and a Router needs to see those as well as the top-level code.
function codesIn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(codesIn);
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => (key === 'code' && typeof item === 'string' ? [item] : codesIn(item)));
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

export const jrnyClient = { callJrny, request, find, joinUrl, secretsOf };

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
  headers?: Record<string, string>;
};

type SendParams = {
  trace: Tracer;
  auth: JrnyAuth;
  method: HttpMethod;
  url: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type JrnyErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};
