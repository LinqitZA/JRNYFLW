# MS Graph Mail piece: design

**Date:** 2026-10-13
**Status:** Draft for review
**Package:** `@jrnyflw/ms-graph-mail` 0.1.0, folder `packages/pieces/custom/ms-graph-mail`. Its `AP_DEV_PIECES` name is `ms-graph-mail`.

## Purpose

Flows need to email people about data problems, for example:
- an AON portal order with an unknown stock or address code;
- a dispatch that the courier status sync couldn't update.

The standard Microsoft Outlook piece isn't in the deployed image. It also signs in as a person, so notifications stop when that person's password changes or they leave.

This piece sends mail **as the application**, from one shared mailbox. It uses Microsoft Graph with the OAuth2 client-credentials grant, so nobody signs in.

## Microsoft 365 setup (done once, by the M365 admin)

1. Create an app registration (single tenant) and a client secret.
2. Add the Microsoft Graph **application** permission **Mail.Send** and grant admin consent.
3. Recommended: limit the app to the sending mailbox with an Exchange application access policy (or RBAC for Applications). Otherwise Mail.Send lets it send as any mailbox in the tenant.

## Connection

| Field | Type | Notes |
| --- | --- | --- |
| Tenant ID | text | Directory (tenant) ID, a GUID or a domain like `contoso.onmicrosoft.com` |
| Client ID | text | Application (client) ID |
| Client Secret | secret | The secret's **value**, not its ID |
| Sender Mailbox | text | The address the mail comes from, e.g. `notifications@aon.co.za` |

**Validate** requests a token from `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, using `grant_type=client_credentials` and `scope=https://graph.microsoft.com/.default`.

| Result | Message shown |
| --- | --- |
| Success | the connection saves |
| `AADSTS7000215` / `invalid_client` | "Microsoft rejected the client ID or secret" |
| `AADSTS90002` / `AADSTS900023` | "Microsoft does not recognise this tenant ID" |
| Anything else | "Could not get a token from Microsoft: …" |
| Sender Mailbox isn't an email address | rejected before any call |

Validate can't check Mail.Send consent or the mailbox, because that would need extra Graph permissions. The first Send Email is the real test, and its error names the problem.

## Actions

### Send Email

| Input | Notes |
| --- | --- |
| To | Required. One or more addresses separated by commas, semicolons or new lines. |
| CC, BCC | Optional, same format. |
| Subject | Required. |
| Body | Required. |
| Body Type | HTML (default) or Text. |
| Reply To | Optional single address. |
| Save to Sent Items | Checkbox, default on. |
| If the call fails | The standard setting. |

**Behaviour:**
1. **Checks the addresses first:** each must look like `x@y.z`, and To must have at least one. A bad one fails before any call, naming it: "Not an email address: bob@".
2. **Gets a token** (as in Validate), then sends `POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail` with `{ message: { subject, body: { contentType, content }, toRecipients, ccRecipients, bccRecipients, replyTo }, saveToSentItems }`. Graph answers `202` with no body.
3. **Output:** `{ from, to, cc, bcc, subject }`, with the cleaned address lists.
4. **Uses the trace library:**
   - `sent` shows both calls;
   - the token request body is recorded as `client_id=…&client_secret=[redacted]&…`;
   - `Authorization` is redacted;
   - the client secret is scrubbed everywhere.
5. **Error messages for common Graph errors:**

| Graph error | Message |
| --- | --- |
| 403 `ErrorAccessDenied` | "Microsoft refused to send as <sender>: check the Mail.Send application permission, admin consent and any application access policy" |
| 404 `ErrorInvalidUser` / `MailboxNotEnabledForRESTAPI` | "The sender mailbox <sender> was not found or has no Exchange Online mailbox" |
| Anything else | `HTTP <status>: <body>` from the trace library |

### Custom API Call

`createCustomApiCallAction` against `https://graph.microsoft.com/v1.0`. Its auth mapping fetches a token and sets `Authorization: Bearer …`. It's for anything else Graph allows under the app's permissions.

## Not included

- Attachments.
- Reading mail.
- Other clouds (GCC, China).
- Token caching across runs. One token request per send is fine at notification volumes.

## Testing

Unit tests, with the HTTP client mocked:
- address parsing (separators, blanks, duplicates, invalid);
- the sendMail body for To/CC/BCC/Reply-To, HTML/Text and Save to Sent Items;
- the token request (form body, URL with the tenant) and the trace redaction of the secret;
- the Graph 403/404 messages;
- Validate's three AADSTS cases and a bad sender address;
- the Custom API Call auth mapping.

No live test until the AON M365 admin provides an app registration.
