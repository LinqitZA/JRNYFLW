/// <reference types="vitest/globals" />
import { msGraphMail } from '../src';

// A Custom API Call would hand a token that can send as any mailbox in the tenant to whatever URL a flow builder enters.
test('the piece exposes Send Email only', () => {
    expect(Object.keys(msGraphMail.actions())).toEqual(['send_email']);
});
