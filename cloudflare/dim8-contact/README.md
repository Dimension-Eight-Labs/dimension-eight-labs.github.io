# Dimension Eight Labs contact Worker

## Architecture

The static Portfolio page opens the existing contact dialog. On first open, the page loads Cloudflare Turnstile and renders the managed widget. A valid form submission is sent as JSON to the Worker at `https://dim8-contact.rhaag71.workers.dev/submit`. The Worker validates the request, checks the token with Turnstile Siteverify, and sends a plain-text message through the fixed `CONTACT_EMAIL` binding. Submissions are not stored.

The Worker source is `src/index.mjs`; its deployment settings are in `wrangler.toml`. The public site key is `0x4AAAAAAFXJYJNLICTuF6vb`. The Worker expects the private `TURNSTILE_SECRET` secret binding and uses the `CONTACT_EMAIL` binding restricted to `rob@dim8labs.com`. The fixed sender is `website@dim8labs.com`; the visitor's address is used only in the message and `Reply-To`.

Browser requests are accepted only from `https://dim8labs.com` and the site's local-preview origins `http://localhost:8088` and `http://127.0.0.1:8088`. The browser client automatically targets the local Worker at port 8787 on those local hosts; production uses the workers.dev endpoint above.

## Local tests

Run the dependency-free Worker tests from the website repository root:

```sh
node cloudflare/dim8-contact/test/worker.test.mjs
```

For a browser-to-Worker local smoke test, use Cloudflare's published Turnstile test credentials only in local development:

1. In `cloudflare/dim8-contact/.dev.vars` (ignored by Git), set `TURNSTILE_SECRET` to the Cloudflare Turnstile test secret `1x0000000000000000000000000000000AA`.
2. Start local Worker simulation from this directory with `npx wrangler dev --local`. Keep the email binding local; do not enable remote bindings, because those send real email.
3. Serve the website repository root at `http://localhost:8088` (or `http://127.0.0.1:8088`). Before opening the contact dialog, use the browser console to set `document.querySelector("#contact-turnstile").dataset.sitekey = "1x00000000000000000000AA"`. This changes only the current page instance; do not put the test site key in committed HTML.
4. Open Contact, complete the test widget, and submit clearly marked test content. Wrangler simulates email delivery locally and logs the generated message; it does not send it.

The test suite stubs Siteverify and the email binding, so it makes no network requests and sends no email. Cloudflare's always-failing test key pair can also be used for a local UI failure-path check: site key `2x00000000000000000000AB` with test secret `2x0000000000000000000000000000000AA`. Never use either test pair in production.

## Deploy and production test

From `cloudflare/dim8-contact/`, with Wrangler authenticated to the account:

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler deploy
```

The first command prompts for the secret; enter it privately at the prompt. It is not in Wrangler configuration or source. If the dashboard already has the correct secret, no update is needed. The Wrangler configuration mirrors the existing email binding and destination restriction. Do not add `remote = true` to the email binding for local development.

After deployment, test the form on `https://dim8labs.com/portfolio/` with a real Turnstile challenge and a clearly identified test message, then confirm receipt at `rob@dim8labs.com`. This is the only end-to-end production check and will send a real email.

## Common failures

- A Turnstile error or `403` usually means a missing/expired/reused token, a hostname mismatch, or the wrong site key/secret pair. Production Siteverify must return `dim8labs.com` as the hostname.
- A browser CORS failure means the page origin is not in the Worker allowlist. Keep the list exact; add a production origin only after confirming the site's canonical domain.
- `503` can indicate Siteverify is unavailable, `TURNSTILE_SECRET` or `CONTACT_EMAIL` is missing, or email delivery failed. The public response intentionally does not expose provider details.
- If Turnstile cannot load, check that the browser can reach `challenges.cloudflare.com` and reopen the dialog to retry.
- The email sender domain must be enabled for Cloudflare Email Service. The visitor's address is never used as the sender.

## Rollback or removal

To roll back a deployed Worker, use `npx wrangler rollback [VERSION_ID]` from this directory or select a prior Worker version in the Cloudflare dashboard. Rolling back affects the deployed Worker, not this source tree. To remove the Worker entirely, `npx wrangler delete` removes the endpoint and its Worker deployment; also remove the form's client integration or restore the disconnected-form UI before relying on the static site again. Do not delete the Worker or bindings merely to test a rollback.
