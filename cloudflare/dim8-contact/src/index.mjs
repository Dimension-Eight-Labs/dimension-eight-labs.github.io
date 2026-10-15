const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CONTACT_PATH = "/submit";
const MAX_BODY_BYTES = 12 * 1024;
const MAX_TOKEN_LENGTH = 2048;
const RECIPIENT = "rob@dim8labs.com";
const SENDER = "website@mail.dim8labs.com";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

const ALLOWED_ORIGINS = new Map([
  ["https://dim8labs.com", "dim8labs.com"],
  ["http://localhost:8088", "localhost"],
  ["http://127.0.0.1:8088", "127.0.0.1"],
]);

function jsonResponse(origin, body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
    ...extraHeaders,
  });

  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function invalidResponse(origin, status = 400) {
  return jsonResponse(origin, { ok: false, error: "invalid_submission" }, status);
}

async function readJsonBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return { error: "invalid" };

  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      return { error: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: "invalid" };
  }
}

function hasControlCharacters(value, allowMessageWhitespace = false) {
  const controls = allowMessageWhitespace
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/
    : /[\u0000-\u001F\u007F-\u009F]/;
  return controls.test(value);
}

function isValidEmail(value) {
  const [localPart, domain, ...extra] = value.split("@");
  if (
    extra.length > 0 || !localPart || !domain ||
    localPart.length > 64 || domain.length > 253 ||
    localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
  ) {
    return false;
  }

  const labels = domain.split(".");
  return labels.length > 1 && labels.every((label) =>
    label.length > 0 && label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

function parseSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowedFields = new Set(["name", "email", "subject", "message", "website", "turnstileToken"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return null;
  if (!["name", "email", "subject", "message", "website", "turnstileToken"].every((key) => typeof value[key] === "string")) {
    return null;
  }

  const submission = {
    name: value.name.trim(),
    email: value.email.trim(),
    subject: value.subject.trim(),
    message: value.message.trim().replace(/\r\n?/g, "\n"),
    website: value.website.trim(),
    turnstileToken: value.turnstileToken.trim(),
  };

  if (
    submission.name.length < 1 || submission.name.length > 120 || hasControlCharacters(submission.name) ||
    submission.email.length < 3 || submission.email.length > 254 || hasControlCharacters(submission.email) ||
    !isValidEmail(submission.email) ||
    submission.subject.length < 1 || submission.subject.length > 160 || hasControlCharacters(submission.subject) ||
    submission.message.length < 1 || submission.message.length > 5000 || hasControlCharacters(submission.message, true) ||
    submission.turnstileToken.length < 1 || submission.turnstileToken.length > MAX_TOKEN_LENGTH ||
    submission.website.length > 256
  ) {
    return null;
  }

  return submission;
}

async function verifyTurnstile(token, origin, request, secret) {
  const body = new URLSearchParams({ secret, response: token });
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) body.set("remoteip", clientIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { unavailable: true };
    const result = await response.json();
    return {
      valid: result.success === true && result.hostname === ALLOWED_ORIGINS.get(origin),
    };
  } catch {
    return { unavailable: true };
  }
}

function logResendFailure(status, responseBody) {
  const errorCode = typeof responseBody?.name === "string"
    ? responseBody.name
    : typeof responseBody?.code === "string"
      ? responseBody.code
      : null;
  const safeCode = errorCode && /^[A-Za-z0-9_.-]{1,64}$/.test(errorCode)
    ? errorCode
    : "unspecified";
  console.error(`Resend delivery failed: HTTP ${status}, ${safeCode}`);
}

async function sendContactEmail(submission, apiKey) {
  const emailText = [
    "New message from dim8labs.com",
    "",
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Subject: ${submission.subject}`,
    "",
    "Message:",
    submission.message,
  ].join("\n");

  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SENDER,
      to: [RECIPIENT],
      subject: `Website contact: ${submission.subject}`,
      text: emailText,
      reply_to: submission.email,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (response.ok) return true;

  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }
  logResendFailure(response.status, responseBody);
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (url.pathname !== CONTACT_PATH) {
      return jsonResponse(origin, { ok: false, error: "not_found" }, 404);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(null, { ok: false, error: "origin_not_allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      const requestedMethod = request.headers.get("Access-Control-Request-Method");
      const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);
      if (requestedMethod !== "POST" || requestedHeaders.some((header) => header !== "content-type")) {
        return jsonResponse(origin, { ok: false, error: "cors_not_allowed" }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(origin, { ok: false, error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });
    }

    if ((request.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return jsonResponse(origin, { ok: false, error: "content_type_not_supported" }, 415);
    }

    const contentLength = request.headers.get("Content-Length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
      return invalidResponse(origin, Number(contentLength) > MAX_BODY_BYTES ? 413 : 400);
    }

    let parsedBody;
    try {
      parsedBody = await readJsonBody(request);
    } catch {
      return invalidResponse(origin);
    }
    if (parsedBody.error === "too_large") return invalidResponse(origin, 413);
    if (parsedBody.error) return invalidResponse(origin);

    const submission = parseSubmission(parsedBody.value);
    if (!submission) return invalidResponse(origin);
    if (submission.website) return invalidResponse(origin, 403);
    if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY) {
      return jsonResponse(origin, { ok: false, error: "service_unavailable" }, 503);
    }

    const verification = await verifyTurnstile(submission.turnstileToken, origin, request, env.TURNSTILE_SECRET);
    if (verification.unavailable) {
      return jsonResponse(origin, { ok: false, error: "verification_unavailable" }, 503);
    }
    if (!verification.valid) {
      return jsonResponse(origin, { ok: false, error: "verification_failed" }, 403);
    }

    try {
      if (!await sendContactEmail(submission, env.RESEND_API_KEY)) {
        return jsonResponse(origin, { ok: false, error: "delivery_failed" }, 503);
      }
    } catch {
      console.error("Resend delivery request failed before receiving a response");
      return jsonResponse(origin, { ok: false, error: "delivery_failed" }, 503);
    }

    return jsonResponse(origin, { ok: true });
  },
};
