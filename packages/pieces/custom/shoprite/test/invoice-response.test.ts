/// <reference types="vitest/globals" />
import { invoiceResponse } from '../src/lib/invoice-response';

const MESSAGE = 'Validation Error:  The Invoice Message is empty or not recognized. \\r\\nEnsure you specify the appropriate Media Type (eg. application/json OR application/xml) in the Content-Type header\\r\\nMissing values between tags, eg tag values for a field such as creationDateTime, missing the date value, Invalid:  &lt;creationDateTime&gt;&lt;/creationDateTime&gt;\\r\\n\\r\\n';
const ERROR_BODY = `<Error><Message>${MESSAGE}</Message><ExceptionMessage>The Invoice Message is empty or not recognized.</ExceptionMessage><ExceptionType>System.ComponentModel.DataAnnotations.ValidationException</ExceptionType><StackTrace>   at B2B.GS1.RESTFul.Web.API.Controllers.VendorInvoiceController.Post(InvoiceMessageType invoiceMessageViewModel, String userName, String password)\\r\\n   at lambda_method(Closure , Object , Object[] )</StackTrace></Error>`;
const EXPECTED = 'Validation Error: The Invoice Message is empty or not recognized. Ensure you specify the appropriate Media Type (eg. application/json OR application/xml) in the Content-Type header Missing values between tags, eg tag values for a field such as creationDateTime, missing the date value, Invalid: <creationDateTime></creationDateTime>';

describe('invoiceResponse.confirmation', () => {
    test('returns the text of Shoprite\'s <string> confirmation', () => {
        expect(invoiceResponse.confirmation('<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">1 record was successfully inserted</string>')).toBe('1 record was successfully inserted');
        expect(invoiceResponse.confirmation('<string>1 record was successfully inserted</string>')).toBe('1 record was successfully inserted');
    });

    test('accepts the confirmation as a plain string, as a JSON response would parse', () => {
        expect(invoiceResponse.confirmation('1 record was successfully inserted')).toBe('1 record was successfully inserted');
    });

    test('returns null for anything that does not confirm the insert', () => {
        expect(invoiceResponse.confirmation('<string>0 records inserted</string>')).toBeNull();
        expect(invoiceResponse.confirmation('')).toBeNull();
        expect(invoiceResponse.confirmation(undefined)).toBeNull();
    });
});

describe('invoiceResponse.failure', () => {
    test('keeps only Shoprite\'s Message, decoded and on one line, without the stack trace', () => {
        const message = invoiceResponse.failure({ status: 400, body: ERROR_BODY });
        expect(message).toBe(EXPECTED);
        expect(message).not.toContain('StackTrace');
        expect(message).not.toContain('ValidationException');
    });

    test('cleans real CR LF line breaks the same way as literal \\r\\n text', () => {
        expect(invoiceResponse.failure({ status: 400, body: ERROR_BODY.replace(/\\r\\n/g, '\r\n') })).toBe(EXPECTED);
    });

    test('reads Message from a JSON error body', () => {
        expect(invoiceResponse.failure({ status: 500, body: { Message: 'An error has occurred.', ExceptionMessage: 'Object reference not set' } })).toBe('An error has occurred.');
    });

    test('falls back to the status and body when there is no Message', () => {
        expect(invoiceResponse.failure({ status: 502, body: '<html>Bad Gateway</html>' })).toBe('HTTP 502: <html>Bad Gateway</html>');
        expect(invoiceResponse.failure({ status: 503, body: '' })).toBe('HTTP 503 with no response body');
    });

    test('caps the message at 1,000 characters', () => {
        const message = invoiceResponse.failure({ status: 400, body: `<Error><Message>${'x'.repeat(1500)}</Message></Error>` });
        expect(message).toHaveLength(1000);
        expect(message.endsWith('…')).toBe(true);
    });
});

describe('invoiceResponse.unconfirmed', () => {
    test('asks for a check in Shoprite before resending, with what Shoprite said', () => {
        expect(invoiceResponse.unconfirmed({ status: 200, body: '<string>0 records inserted</string>' })).toBe(
            'Shoprite answered 200 but did not confirm the invoice: <string>0 records inserted</string>. Check in Shoprite before resending.',
        );
        expect(invoiceResponse.unconfirmed({ status: 204, body: '' })).toBe(
            'Shoprite answered 204 but did not confirm the invoice: (empty body). Check in Shoprite before resending.',
        );
    });
});
