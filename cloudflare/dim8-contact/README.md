# Dimension Eight Labs contact Worker

## Architecture

The static Portfolio page opens the existing contact dialog. On first open, the page loads Cloudflare Turnstile and renders the managed widget. A valid form submission is sent as JSON to the Worker at `https://dim8-contact.rhaag71.workers.dev/submit`. The Worker validates the request, checks the token with Turnstile Siteverify, and sends a plain-text message through the Resend Email API. Submissions are not stored.

The Worker source is `src/index.mjs`; its deployment settings are in `wrangler.toml`. The public site key is `0x4AAAAAAFXJYJNLICTuF6vb`. It expects two private Worker secrets: `TURNSTILE_SECRET` for Siteverify and `RESEND_API_KEY` for Resend. Outbound messages use the verified sender `website@mail.dim8labs.com`, are sent only to `rob@dim8labs.com`, and set the visitor's address as `Reply-To`.

Browser requests are accepted only from `https://dim8labs.com` and the site's local-preview origins `http://localhost:8088` and `http://127.0.0.1:8088`. The browser client automatically targets the local Worker at port 8787 on those local hosts; production uses the workers.dev endpoint above.

## Local tests

Run the dependency-free Worker tests from the website repository root:

```sh
node cloudflare/dim8-contact/test/worker.test.mjs
```

For a safe browser-to-Worker failure-path smoke test, use Cloudflare's published Turnstile test credentials only in local development, and set a deliberately invalid Resend key in `.dev.vars` so no email can be delivered:

1. In `cloudflare/dim8-contact/.dev.vars` (ignored by Git), set `TURNSTILE_SECRET` to the Cloudflare Turnstile test secret `1x0000000000000000000000000000000AA`.
2. In the same local-only file, set `RESEND_API_KEY` to a placeholder such as `re_test_placeholder`.
3. Start local Worker simulation from this directory with `npx wrangler dev --local`.
4. Serve the website repository root at `http://localhost:8088` (or `http://127.0.0.1:8088`). Before opening the contact dialog, use the browser console to set `document.querySelector("#contact-turnstile").dataset.sitekey = "1x00000000000000000000AA"`. This changes only the current page instance; do not put the test site key in committed HTML.
5. Open Contact, complete the test widget, and submit clearly marked test content. The expected result is the generic delivery-failure message because the placeholder Resend key is invalid; no email is sent. The dependency-free unit tests mock both Siteverify and Resend and cover the success path without network requests or email delivery.

Do not put a real Resend API key in local `.dev.vars` for a smoke test unless you intentionally want a valid submission to send a real email to `rob@dim8labs.com`.

The test suite mocks both Siteverify and Resend, so it makes no network requests and sends no email. Cloudflare's always-failing test key pair can also be used for a local UI failure-path check: site key `2x00000000000000000000AB` with test secret `2x0000000000000000000000000000000AA`. Never use either test pair in production.

## Deploy and production test

From `cloudflare/dim8-contact/`, with Wrangler authenticated to the account:

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Each secret command prompts for its value; enter secrets privately at the prompt. They are not in Wrangler configuration or source. `RESEND_API_KEY` must be an API key with permission to send from the verified Resend domain. After deployment, remove the obsolete `CONTACT_EMAIL` Email Service binding from the Worker in the Cloudflare dashboard; the Wrangler configuration no longer defines it.

After deployment, test the form on `https://dim8labs.com/portfolio/` with a real Turnstile challenge and a clearly identified test message, then confirm receipt at `rob@dim8labs.com`. This is the production end-to-end check and will send a real email.

To rotate the Resend key, create a replacement key in Resend, run `npx wrangler secret put RESEND_API_KEY` from this directory and enter the new value privately, then verify delivery with an intentional production test message. Revoke the old Resend key once the replacement is confirmed. Never add either key to source control or Wrangler config.

## Common failures

- A Turnstile error or `403` usually means a missing/expired/reused token, a hostname mismatch, or the wrong site key/secret pair. Production Siteverify must return `dim8labs.com` as the hostname.
- A browser CORS failure means the page origin is not in the Worker allowlist. Keep the list exact; add a production origin only after confirming the site's canonical domain.
- `503` can indicate Siteverify is unavailable, either required Worker secret is missing, or Resend rejected/failed the delivery request. The public response intentionally does not expose provider details; concise provider status diagnostics are logged without message content.
- If Turnstile cannot load, check that the browser can reach `challenges.cloudflare.com` and reopen the dialog to retry.
- Resend must have `mail.dim8labs.com` verified and the API key must be authorized to send from `website@mail.dim8labs.com`. The visitor's address is never used as the sender.

## Rollback or removal

To roll back a deployed Worker, use `npx wrangler rollback [VERSION_ID]` from this directory or select a prior Worker version in the Cloudflare dashboard. Rolling back affects the deployed Worker, not this source tree. To remove the Worker entirely, `npx wrangler delete` removes the endpoint and its Worker deployment; also remove the form's client integration or restore the disconnected-form UI before relying on the static site again. Do not delete the Worker or bindings merely to test a rollback.
