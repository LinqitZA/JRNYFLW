import {
  AuthenticationType,
  HttpError,
  HttpMethod,
  httpClient,
} from '@activepieces/pieces-common';
import { JrnyAuth } from './auth';

export type JrnyErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export class JrnyApiError extends Error {
  public readonly httpStatus: number;
  public readonly errorCode: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(httpStatus: number, envelope: JrnyErrorEnvelope) {
    super(`JRNY API error ${httpStatus} ${envelope.error.code}: ${envelope.error.message}`);
    this.name = 'JrnyApiError';
    this.httpStatus = httpStatus;
    this.errorCode = envelope.error.code;
    this.details = envelope.error.details;
    this.requestId = envelope.requestId;
  }
}

const trimTrailingSlash = (url: string): string =>
  url.endsWith('/') ? url.slice(0, -1) : url;

export const callJrny = async <TResponse>(
  auth: JrnyAuth,
  method: HttpMethod,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<TResponse> => {
  const url = `${trimTrailingSlash(auth.baseUrl)}${path}`;
  try {
    const response = await httpClient.sendRequest<TResponse>({
      method,
      url,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: auth.bearerToken,
      },
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body,
    });
    return response.body;
  } catch (err) {
    if (err instanceof HttpError) {
      const status = err.response?.status ?? 0;
      const responseBody = err.response?.body;
      if (isJrnyErrorEnvelope(responseBody)) {
        throw new JrnyApiError(status, responseBody);
      }
      throw new Error(
        `JRNY API call to ${method} ${url} failed with HTTP ${status}: ${stringifyForLog(responseBody)}`,
      );
    }
    throw err;
  }
};

const isJrnyErrorEnvelope = (value: unknown): value is JrnyErrorEnvelope => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.error !== 'object' || v.error === null) return false;
  const e = v.error as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
};

const stringifyForLog = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
