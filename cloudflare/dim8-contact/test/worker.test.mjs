import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.mjs";

const SITEVERIFY_SECRET = "test-secret-not-for-production";
const RESEND_API_KEY = "re_test_key_not_for_production";
const ORIGIN = "https://dim8labs.com";
const RESEND_URL = "https://api.resend.com/emails";
const payload = {
  name: "Test Visitor",
  email: "visitor@example.test",
  subject: "A test message",
  message: "Hello from a local test.",
  website: "",
  turnstileToken: "test-token",
};

function request(body, options = {}) {
  const headers = new Headers({ Origin: ORIGIN, ...options.headers });
  if (body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(`https://dim8-contact.rhaag71.workers.dev${options.path ?? "/submit"}`, {
    method: options.method ?? "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function withVerification(t, verification, run, resendResponse = () => new Response(JSON.stringify({ id: "local-test-email" }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
})) {
  const originalFetch = globalThis.fetch;
  let verificationRequest;
  let resendRequest;
  globalThis.fetch = async (url, init) => {
    if (String(url) === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      verificationRequest = { url: String(url), init };
      return new Response(JSON.stringify(verification), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === RESEND_URL) {
      resendRequest = { url: String(url), init };
      return resendResponse();
    }
    assert.fail(`Unexpected outbound request: ${String(url)}`);
  };

  try {
    await run({
      verificationRequest: () => verificationRequest,
      resendRequest: () => resendRequest,
      env: {
        TURNSTILE_SECRET: SITEVERIFY_SECRET,
        RESEND_API_KEY,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("valid submission sends the expected email through Resend", async (t) => {
  await withVerification(t, { success: true, hostname: "dim8labs.com" }, async (context) => {
    const response = await worker.fetch(request(payload, {
      headers: { "CF-Connecting-IP": "192.0.2.44" },
    }), context.env);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.equal(context.verificationRequest().url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const verifyForm = new URLSearchParams(context.verificationRequest().init.body);
    assert.equal(verifyForm.get("secret"), SITEVERIFY_SECRET);
    assert.equal(verifyForm.get("response"), "test-token");
    assert.equal(verifyForm.get("remoteip"), "192.0.2.44");

    const resendRequest = context.resendRequest();
    assert.equal(resendRequest.url, RESEND_URL);
    assert.equal(resendRequest.init.method, "POST");
    assert.equal(resendRequest.init.headers.Authorization, `Bearer ${RESEND_API_KEY}`);
    assert.equal(resendRequest.init.headers["Content-Type"], "application/json");
    const sentEmail = JSON.parse(resendRequest.init.body);
    assert.deepEqual(sentEmail.to, ["rob@dim8labs.com"]);
    assert.equal(sentEmail.from, "website@mail.dim8labs.com");
    assert.equal(sentEmail.reply_to, payload.email);
    assert.equal(sentEmail.subject, "Website contact: A test message");
    assert.match(sentEmail.text, /Name: Test Visitor/);
    assert.match(sentEmail.text, /Email: visitor@example\.test/);
    assert.match(sentEmail.text, /Message:\nHello from a local test\./);
  });
});

test("rejects non-POST methods and paths", async () => {
  const methodResponse = await worker.fetch(request(undefined, { method: "GET" }), {});
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("Allow"), "POST, OPTIONS");

  const pathResponse = await worker.fetch(request(payload, { path: "/" }), {});
  assert.equal(pathResponse.status, 404);
});

test("allows only expected CORS origins, method, and header", async () => {
  const allowed = await worker.fetch(new Request("https://dim8-contact.rhaag71.workers.dev/submit", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:8088",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  }), {});
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "http://localhost:8088");
  assert.equal(allowed.headers.get("Access-Control-Allow-Methods"), "POST");

  const denied = await worker.fetch(request(payload, { headers: { Origin: "https://attacker.example" } }), {});
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects malformed JSON, missing fields, wrong content type, and oversized bodies", async () => {
  const malformed = await worker.fetch(request("{"), {});
  assert.equal(malformed.status, 400);

  const missing = await worker.fetch(request({ ...payload, message: "  " }), {});
  assert.equal(missing.status, 400);

  const contentType = await worker.fetch(request(JSON.stringify(payload), {
    headers: { "Content-Type": "text/plain" },
  }), {});
  assert.equal(contentType.status, 415);

  const tooLarge = await worker.fetch(request({ ...payload, message: "x".repeat(13_000) }), {});
  assert.equal(tooLarge.status, 413);
});

test("rejects invalid email before calling Siteverify or sending email", async (t) => {
  await withVerification(t, { success: true, hostname: "dim8labs.com" }, async (context) => {
    for (const email of ["not-an-email", "person@bad..example"]) {
      const response = await worker.fetch(request({ ...payload, email }), context.env);
      assert.equal(response.status, 400);
      assert.equal(context.verificationRequest(), undefined);
      assert.equal(context.resendRequest(), undefined);
    }
  });
});

test("rejects a filled honeypot without verifying or delivering", async (t) => {
  await withVerification(t, { success: true, hostname: "dim8labs.com" }, async (context) => {
    const response = await worker.fetch(request({ ...payload, website: "bot-filled-this" }), context.env);
    assert.equal(response.status, 403);
    assert.equal(context.verificationRequest(), undefined);
    assert.equal(context.resendRequest(), undefined);
  });
});

test("rejects failed Turnstile verification and hostname mismatch", async (t) => {
  await withVerification(t, { success: false, hostname: "dim8labs.com" }, async (context) => {
    const response = await worker.fetch(request(payload), context.env);
    assert.equal(response.status, 403);
    assert.equal(context.resendRequest(), undefined);
  });

  await withVerification(t, { success: true, hostname: "other.example" }, async (context) => {
    const response = await worker.fetch(request(payload), context.env);
    assert.equal(response.status, 403);
    assert.equal(context.resendRequest(), undefined);
  });
});

test("returns a non-sensitive service error when verification cannot be reached", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("private test detail"); };
  try {
    const response = await worker.fetch(request(payload), {
      TURNSTILE_SECRET: SITEVERIFY_SECRET,
      RESEND_API_KEY,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "verification_unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns generic delivery_failed when Resend rejects the request", async (t) => {
  const originalConsoleError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args.join(" "));
  try {
    await withVerification(t, { success: true, hostname: "dim8labs.com" }, async (context) => {
      const response = await worker.fetch(request(payload), context.env);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "delivery_failed" });
      assert.ok(context.resendRequest());
    }, () => new Response(JSON.stringify({
      name: "validation_error",
      message: "private provider detail must not reach the browser",
    }), { status: 422, headers: { "Content-Type": "application/json" } }));
    assert.match(diagnostics.join("\n"), /HTTP 422, validation_error/);
    assert.doesNotMatch(diagnostics.join("\n"), /visitor@example\.test|private provider detail|re_test_key/);
  } finally {
    console.error = originalConsoleError;
  }
});
