/// <reference types="vitest/globals" />
import { vi } from 'vitest';
import { httpClient, HttpMethod } from '@activepieces/pieces-common';
import { ERROR_MESSAGES_TO_REDACT } from '@activepieces/shared';

// The engine redacts console.error lines by their first argument; if the HTTP client's wording drifts from that list, request bodies (passwords, client secrets) reach the container logs.
test('the HTTP client failure log line is one the engine redacts', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await httpClient
        .sendRequest({ method: HttpMethod.POST, url: 'http://127.0.0.1:1/token', body: 'client_secret=topsecret' })
        .catch(() => undefined);
    const firstArgs = errorSpy.mock.calls.map((call) => call[0]);
    errorSpy.mockRestore();
    expect(firstArgs.length).toBeGreaterThan(0);
    for (const first of firstArgs) {
        expect(typeof first === 'string' && ERROR_MESSAGES_TO_REDACT.some((m) => first.includes(m))).toBe(true);
    }
});
