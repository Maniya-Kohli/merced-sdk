import type { WebhookEvent, WebhookPayload, Job } from "./types";

export interface WebhookHeaders {
  event: WebhookEvent;
  deliveryId: string;
  timestamp: string;
  signature: string;
}

export type WebhookHandler = (payload: WebhookPayload) => void | Promise<void>;

export function parseWebhookHeaders(headers: Record<string, string | undefined>): WebhookHeaders | null {
  const event = headers["x-merced-event"] || headers["X-Merced-Event"];
  const deliveryId = headers["x-merced-delivery"] || headers["X-Merced-Delivery"];
  const timestamp = headers["x-merced-timestamp"] || headers["X-Merced-Timestamp"];
  const signature = headers["x-merced-signature"] || headers["X-Merced-Signature"];

  if (!event || !deliveryId || !timestamp || !signature) return null;

  return {
    event: event as WebhookEvent,
    deliveryId,
    timestamp,
    signature,
  };
}

export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  // Works in Node.js 18+ (Web Crypto API) and Cloudflare Workers
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = `sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export function createWebhookRouter(secret: string) {
  const handlers = new Map<WebhookEvent | "*", WebhookHandler[]>();

  function on(event: WebhookEvent | "*", handler: WebhookHandler) {
    const list = handlers.get(event) || [];
    list.push(handler);
    handlers.set(event, list);
  }

  async function handleRequest(request: Request): Promise<Response> {
    const headerObj: Record<string, string | undefined> = {};
    request.headers.forEach((v, k) => { headerObj[k] = v; });

    const parsed = parseWebhookHeaders(headerObj);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "Missing webhook headers" }), { status: 400 });
    }

    const rawBody = await request.text();

    const valid = await verifyWebhookSignature(secret, rawBody, parsed.signature);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    const body = JSON.parse(rawBody) as { event: string; job_id: string | null; job: Job | null; timestamp: string };
    const payload: WebhookPayload = {
      event: parsed.event,
      agent_id: parsed.deliveryId,
      job: body.job,
      timestamp: body.timestamp,
    };

    const eventHandlers = handlers.get(parsed.event) || [];
    const wildcardHandlers = handlers.get("*") || [];

    for (const handler of [...eventHandlers, ...wildcardHandlers]) {
      await handler(payload);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return { on, handleRequest };
}
