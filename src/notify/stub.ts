import type { Diagnostic, NotifyConfig, RunResult } from "../types.js";
import { deliverWebhook } from "./webhook.js";

export type { NotifyConfig };

/**
 * Always log; POST webhook when notify.webhook_url is set.
 * Всегда лог в stderr; webhook — если указан URL.
 */
export async function notifyRunComplete(
  notify: NotifyConfig | undefined,
  result: RunResult,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<Diagnostic[]> {
  if (!notify?.enabled) return [];

  log(
    `adaparse:notify ok=${result.ok} target=${result.target} items=${result.items.length}` +
      (notify.webhookUrl ? ` webhook=${notify.webhookUrl}` : " (log only)"),
  );

  const diags: Diagnostic[] = [
    {
      level: "info",
      code: "notify_stub",
      message: notify.webhookUrl
        ? "Notify hook invoked (webhook delivery attempted)"
        : "Notify hook invoked (log only — no webhook)",
      details: {
        enabled: true,
        webhookConfigured: Boolean(notify.webhookUrl),
        ok: result.ok,
      },
    },
  ];

  if (notify.webhookUrl) {
    diags.push(...(await deliverWebhook(notify, result, log)));
  }
  return diags;
}
