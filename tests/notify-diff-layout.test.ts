import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signPayload } from "../src/notify/webhook.js";
import { diffSnapshots } from "../src/memory/diff.js";
import { layoutFingerprint, layoutDistance } from "../src/heal/layout.js";
import { BrowserFetcher } from "../src/fetch/browser.js";

describe("notify / diff / layout / browser", () => {
  it("signs webhook payload with HMAC", () => {
    const body = JSON.stringify({ ok: true });
    const sig = signPayload(body, "secret");
    const expected =
      "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(sig).toBe(expected);
  });

  it("diffs snapshot fields", () => {
    const older = [{ url: "/a", title: "A", price: 10 }];
    const newer = [
      { url: "/a", title: "A", price: 12 },
      { url: "/b", title: "B", price: 5 },
    ];
    const d = diffSnapshots(older, newer);
    expect(d.countDelta).toBe(1);
    expect(d.added.length).toBe(1);
    expect(d.changed.some((c) => c.field === "price")).toBe(true);
  });

  it("layout fingerprints differ across markup", () => {
    const a = layoutFingerprint("<html><body><ul><li>a</li><li>b</li></ul></body></html>");
    const b = layoutFingerprint(
      "<html><body><div><article>x</article><article>y</article></div></body></html>",
    );
    expect(a.hash).not.toBe(b.hash);
    expect(layoutDistance(a, b)).toBeGreaterThan(0.2);
  });

  it("BrowserFetcher errors clearly without playwright", async () => {
    const f = new BrowserFetcher();
    await expect(f.fetch("https://example.com")).rejects.toThrow(/playwright/i);
  });
});
