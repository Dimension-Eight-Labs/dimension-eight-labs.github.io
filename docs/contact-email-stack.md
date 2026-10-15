# Dimension Eight Labs contact email stack

This document describes the production contact path used by the Portfolio contact popup. The website remains static: GitHub Pages serves the UI, while a Cloudflare Worker handles validation and connects Turnstile to Resend. The Worker does not store submissions.

## Architecture at a glance

```text
Visitor's browser
      |
      | HTTPS: form fields + Turnstile token
      v
GitHub Pages — https://dim8labs.com/
      |
      | POST /submit
      v
Cloudflare Worker — dim8-contact
      |                         \
      | HTTPS: Siteverify        \ HTTPS: POST /emails
      | TURNSTILE_SECRET         \ RESEND_API_KEY
      v                            v
Cloudflare Turnstile             Resend
  token decision                   |
                                   | authenticated outbound email
                                   v
                                Proton Mail
                                   |
                                   v
                           rob@dim8labs.com
```

The browser calls the Worker endpoint `https://dim8-contact.rhaag71.workers.dev/submit`. Turnstile is a separate verification dependency: a successful browser widget is not trusted on its own; the Worker verifies the token server-side before it contacts Resend.

## Production request flow

1. A visitor opens the contact popup on [dim8labs.com](https://dim8labs.com/) from the Portfolio page.
2. The popup loads and renders the managed Cloudflare Turnstile widget.
3. The visitor enters a name, email address, subject, and message, completes Turnstile, and submits.
4. The browser sends those fields, the honeypot field, and the Turnstile token as JSON to `https://dim8-contact.rhaag71.workers.dev/submit`.
5. The `dim8-contact` Worker checks the request origin and method, parses and bounds the JSON body, validates the fields, rejects a filled honeypot, and verifies the token with Cloudflare Siteverify using `TURNSTILE_SECRET`.
6. Only after those checks pass, the Worker sends `POST https://api.resend.com/emails`, authenticating with `RESEND_API_KEY`.
7. The email is fixed to `From: website@mail.dim8labs.com` and `To: rob@dim8labs.com`. The visitor's address is set as `Reply-To` and included in the plain-text message body; it can never choose the sender or recipient.
8. Resend handles outbound delivery to the business mailbox hosted by Proton Mail.
9. The message arrives at `rob@dim8labs.com`. Replying from Proton should address the visitor through the message's `Reply-To` header.

The Worker returns a small JSON success response to the existing client. Validation, verification, or delivery failures return the existing non-sensitive error responses; the browser does not receive Resend's provider details.

## Service responsibilities

### GitHub Pages

GitHub Pages hosts and serves the static website. It serves the contact UI but does not process submissions server-side and does not hold email-provider credentials.

### Cloudflare Turnstile

Turnstile provides the browser bot-check widget and issues a token for a completed challenge. The public site key is embedded in the Portfolio markup. The secret is separate and Worker-only. The Worker submits the token to Siteverify and checks both `success` and the returned hostname before allowing delivery.

### Cloudflare Worker

`dim8-contact` is the only backend component in the form path. It enforces CORS and request method/content type, bounds and validates the submission, checks the honeypot, calls Siteverify, formats the email, and sends it to Resend. Keeping this step server-side prevents the browser from receiving `RESEND_API_KEY`. The Worker does not persist contact messages.

### Resend

Resend is the authenticated transactional outbound email provider. It sends from the verified `mail.dim8labs.com` domain using `website@mail.dim8labs.com`. The sender and recipient are fixed in Worker code. The visitor's address is supplied as `reply_to`, not `from`.

### Proton Mail

Proton hosts the real business mailbox at `rob@dim8labs.com` and remains responsible for normal `dim8labs.com` mailbox use. It is the destination mailbox, not the Worker’s outbound API provider.

## Domain and DNS relationship

The normal business email domain is `dim8labs.com`; its existing Proton mailbox routing remains in place. Resend uses the separate sending subdomain `mail.dim8labs.com`, whose DNS authentication records authorize transactional mail from that subdomain. Keeping those roles separate avoids changing the root domain's normal Proton mail handling.

The repository does not contain the actual Resend DNS record values. They are managed externally in Cloudflare DNS and should be checked against the current Resend domain page and Cloudflare DNS dashboard. Do not recreate or guess record values from this document. If Resend reports a domain-authentication or delivery problem, compare the live dashboard instructions with the live DNS records.

## Worker configuration and secrets

The Worker is named `dim8-contact`, uses the workers.dev endpoint above, and handles the `/submit` path. Its checked-in configuration is [`cloudflare/dim8-contact/wrangler.toml`](../cloudflare/dim8-contact/wrangler.toml).

| Worker secret | Used for | Handling |
| --- | --- | --- |
| `TURNSTILE_SECRET` | Server-side Turnstile Siteverify | Cloudflare Worker secret; never put in frontend or source. |
| `RESEND_API_KEY` | Authorization to Resend's email API | Cloudflare Worker secret; never put in frontend or source. |

The frontend contains only the public Turnstile site key. The old Cloudflare Email Service binding named `CONTACT_EMAIL` is obsolete: it is no longer referenced by the Worker or required by Wrangler configuration. Once the Resend-backed Worker is deployed and confirmed, the old binding can be removed from the Cloudflare dashboard.

## Request validation and security boundaries

The current implementation in [`src/index.mjs`](../cloudflare/dim8-contact/src/index.mjs) applies these checks:

- Only `/submit` is handled. The form uses `POST`; CORS preflight uses `OPTIONS` and permits `POST` with the `Content-Type` header.
- Production browser origin is exactly `https://dim8labs.com`. Local development origins are exactly `http://localhost:8088` and `http://127.0.0.1:8088`.
- Submissions must use `application/json`. The request body is limited to 12 KiB.
- The accepted payload fields are `name`, `email`, `subject`, `message`, `website` (honeypot), and `turnstileToken`; all must be strings. Unknown fields are rejected.
- Name is trimmed and limited to 1–120 characters; email is trimmed and limited to 3–254 characters with a basic address/domain syntax check; subject is trimmed and limited to 1–160 characters; message is trimmed and limited to 1–5,000 characters. Control characters are rejected, except normal message whitespace.
- The Turnstile token must be 1–2,048 characters. The honeypot may be at most 256 characters and must be empty; a filled honeypot is rejected before verification or email delivery.
- If Cloudflare provides `CF-Connecting-IP`, it is passed to Siteverify as verification context. It is not written to application storage.
- Siteverify has an 8-second timeout. Its response must be successful and report the hostname expected for the requesting origin.
- Resend has a 10-second request timeout. A failed provider response or transport error produces a generic delivery failure to the browser. Worker diagnostics include only provider HTTP status and a bounded safe error code, not the message body, visitor email, or API key.

Secrets stay in Cloudflare Worker secret storage. Visitor-controlled text is used only to construct the intended email content and Reply-To header. The Worker does not intentionally log message contents and does not persist submissions. CORS is an origin control for browsers, not a substitute for Turnstile or request validation.

## Local development and automated tests

The current static preview port is **8088** and the local Worker runs on **8787**. From the website repository root, start the static preview with:

```sh
python3 -m http.server 8088
```

From `cloudflare/dim8-contact/`, start the local Worker with:

```sh
npx wrangler dev --local
```

The browser client selects `http://localhost:8787/submit` or `http://127.0.0.1:8787/submit` when opened on those local hosts; on production it uses the workers.dev endpoint. Run the dependency-free Worker tests from the repository root:

```sh
node cloudflare/dim8-contact/test/worker.test.mjs
```

The tests mock both Siteverify and Resend, make no network requests, and send no email. They cover valid Resend request construction, validation, the honeypot, verification failures, generic delivery failure, and CORS.

The production Turnstile site key is intended for the production hostname. Its dashboard hostname restrictions may prevent it from working on localhost. The existing local procedure uses Cloudflare's published Turnstile test site/secret pair: set the test secret in the ignored local `.dev.vars` file and, for the browser smoke test, temporarily set the widget element's `data-sitekey` to the published test site key in the browser console. Do not put a test key in committed markup. The documented safe local smoke test uses a deliberately invalid Resend key, so it exercises the failure response without sending a message. A successful send through a real Resend key is a real email to the fixed recipient; the unit tests provide the no-email success-path coverage.

See [`cloudflare/dim8-contact/README.md`](../cloudflare/dim8-contact/README.md) for the exact local test-key instructions and commands.

## Failure modes and diagnosis

| Symptom | Meaning and next check |
| --- | --- |
| Origin/CORS rejection (`403`) | The page origin is not in the Worker's exact allowlist, or the request is not using the expected preflight method/header. Confirm the production page is served from `https://dim8labs.com`; do not broaden CORS casually. |
| Method rejection (`405`) | The endpoint accepts only `POST` submissions and `OPTIONS` preflight. Check the browser request method and URL path. |
| Content type or body rejection (`415`, `400`, or `413`) | The request is not JSON, is malformed, has missing/extra/non-string fields, fails field validation, or exceeds the 12 KiB body limit. Check the browser payload and field limits above. |
| Honeypot rejection (`403`) | The hidden `website` field was filled. The Worker stops before Turnstile and Resend. |
| Turnstile rejection (`403`) | The token was absent, invalid, expired, already used, or its verified hostname did not match the request origin. Check the widget, public site key, secret, and configured hostname. No Resend request is made. |
| Turnstile unavailable (`503`) | Siteverify could not be reached or returned a non-success HTTP response. Check Cloudflare service/network conditions and Worker logs. |
| Resend delivery failure (`503`, `delivery_failed`) | Resend rejected the request or the API call failed. Check the safe Worker diagnostic (HTTP status/error code), Resend logs, API key status/permissions, fixed sender, and sending-domain verification. Provider details are intentionally not returned to the browser. |
| Missing Worker secret (`503`, `service_unavailable`) | One or both of `TURNSTILE_SECRET` and `RESEND_API_KEY` is not configured for the deployed Worker. Check Worker secret configuration; never print values into logs. |
| Resend domain/DNS verification issue | Resend may reject a sender whose domain is not verified or authenticated. Compare Resend's current instructions with Cloudflare DNS; exact record values are not stored in this repository. |
| Resend accepts the message but it is absent from Proton | API acceptance does not guarantee inbox placement. Check Resend delivery/event logs, Proton spam/filtering, and mailbox availability. |

For live diagnosis, `npx wrangler tail` can show Worker logs. Logs intentionally omit submitted message contents and API credentials. Avoid copying private request data into tickets or chat.

## Deployment and updates

The Worker project is in [`cloudflare/dim8-contact/`](../cloudflare/dim8-contact/). With Wrangler authenticated to the correct Cloudflare account, the current backend deployment command is:

```sh
cd cloudflare/dim8-contact
npx wrangler deploy
```

The two Worker secrets must already be configured in Cloudflare. To set or replace one interactively without putting its value in a command or file:

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
```

Worker deployment and website publication are separate operations. A Worker deploy updates backend code/configuration. GitHub push updates version-controlled website source and may trigger GitHub Pages publication. The repository owner performs staging, commit, push, and deployment operations; do not treat a local documentation/source change as a production update.

### Secret rotation

Never paste production secrets into source files, README files, screenshots, chat logs, or commits.

- **Turnstile:** If rotating the secret, create/rotate it in the Cloudflare Turnstile dashboard, then update the Worker secret using `npx wrangler secret put TURNSTILE_SECRET`. Confirm the widget/site-key and hostname configuration still match the production site. A code redeploy is not normally needed for a secret-only update; verify the Cloudflare dashboard's current activation state.
- **Resend:** Create a replacement API key in Resend with the needed sending permission, update the Worker secret using `npx wrangler secret put RESEND_API_KEY`, then intentionally perform a production test submission. Revoke the old key after confirming delivery.

Never put either secret value in `wrangler.toml`, website JavaScript/HTML, this document, or a committed local config file. The public Turnstile site key is not a secret.

## Production end-to-end test

This procedure sends a real message and should only be run intentionally after deployment:

1. Open the live Portfolio contact form at [dim8labs.com](https://dim8labs.com/portfolio/).
2. Complete Turnstile and confirm it reaches Success.
3. Submit a small, clearly identified test message.
4. Confirm the browser reports success.
5. Confirm the email arrives at `rob@dim8labs.com` in Proton Mail.
6. Inspect the message: `From` is `website@mail.dim8labs.com`, `To` is `rob@dim8labs.com`, the subject starts with `Website contact:`, the body contains the submitted fields, and `Reply-To` is the test address.
7. Optionally use Reply in Proton and confirm it addresses the visitor/test mailbox.

No production test message was sent while preparing this document.

## Design history and cost model

The first implementation used Cloudflare Turnstile, the Worker, and Cloudflare Email Service. The frontend, validation, CORS, Turnstile check, and Worker path worked, but the free Cloudflare outbound-email route did not fit cleanly with the existing Proton-based mail arrangement for the root domain. Rather than changing normal mailbox routing or adding an unnecessary monthly service, outbound transactional delivery moved to Resend. The intended division is now Cloudflare for the edge/backend/security path, Resend for outbound transactional email, and Proton for the real business mailbox.

At the current low contact volume, the design intent is to remain at or near zero incremental cost: GitHub Pages, Cloudflare Worker, Turnstile, and Resend use their free tiers, while Proton is an existing business-mail subscription/service. This is not a quota or price guarantee. Provider limits and pricing change; check each provider dashboard before relying on exact allowances.

## Code and operations references

- [Portfolio contact markup and public Turnstile site key](../portfolio/index.html)
- [Contact dialog, endpoint selection, and browser submission flow](../js/interior.js)
- [Contact dialog styling](../css/interior.css)
- [Worker implementation](../cloudflare/dim8-contact/src/index.mjs)
- [Wrangler configuration](../cloudflare/dim8-contact/wrangler.toml)
- [Worker tests](../cloudflare/dim8-contact/test/worker.test.mjs)
- [Contact Worker setup and local/deployment notes](../cloudflare/dim8-contact/README.md)
