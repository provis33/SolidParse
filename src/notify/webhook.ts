import { createHmac } from "node:crypto";
import type { Diagnostic, NotifyConfig, RunResult } from "../types.js";

export async function deliverWebhook(
  notify: NotifyConfig,
  result: RunResult,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<Diagnostic[]> {
  if (!notify.enabled || !notify.webhookUrl) {
    return [];
  }

  const body = JSON.stringify({
    event: "adaparse.run.complete",
    ts: new Date().toISOString(),
    ok: result.ok,
    target: result.target,
    itemCount: result.items.length,
    failureClass: result.meta.failureClass,
    source: result.meta.source,
    healed: result.meta.healed,
    entryUrl: result.meta.entryUrl,
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "adaparse-notify/0.1",
  };
  if (notify.hmacSecret) {
    const sig = createHmac("sha256", notify.hmacSecret).update(body).digest("hex");
    headers["x-adaparse-signature"] = `sha256=${sig}`;
  }

  try {
    const res = await fetch(notify.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    log(`adaparse:notify webhook status=${res.status}`);
    return [
      {
        level: res.ok ? "info" : "warn",
        code: "notify_webhook",
        message: `Webhook POST ${res.status}`,
        details: { url: notify.webhookUrl, hmac: Boolean(notify.hmacSecret) },
      },
    ];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`adaparse:notify webhook error: ${message}`);
    return [
      {
        level: "warn",
        code: "notify_webhook_error",
        message,
      },
    ];
  }
}

export function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
