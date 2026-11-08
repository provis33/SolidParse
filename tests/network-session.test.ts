import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { parseCookieFile, resolveSession } from "../src/fetch/session.js";
import { extractFromHtmlAsync } from "../src/sources/index.js";
import { extractFromNetworkJson } from "../src/sources/network.js";

describe("network source", () => {
  it("extracts products from injected network JSON", () => {
    const attempt = extractFromNetworkJson(
      [
        {
          products: [
            { name: "Wire Mouse", price: 25, currency: "USD", url: "https://x/p/1" },
            { title: "USB Hub", price: 18.5, currencyCode: "EUR", link: "https://x/p/2" },
          ],
        },
      ],
      { preset: "product_list", url: "https://x/" },
    );
    expect(attempt?.source).toBe("network");
    expect(attempt?.items.length).toBe(2);
    expect(attempt?.items[0]?.fields.title?.value).toBe("Wire Mouse");
    expect(attempt?.items[1]?.fields.price?.value).toBe(18.5);
  });

  it("wins via extractFromHtmlAsync when HTML is empty SPA shell", async () => {
    const html = "<!DOCTYPE html><html><body><div id=app></div></body></html>";
    const attempt = await extractFromHtmlAsync(
      html,
      "https://spa.example/",
      "product_list",
      PRESETS.product_list.defaultFields,
      undefined,
      [
        {
          items: [
            {
              name: "SPA Item",
              price: 9.99,
              currency: "USD",
              url: "https://spa.example/p/1",
              image: "https://spa.example/i.png",
            },
          ],
        },
      ],
    );
    expect(attempt.source).toBe("network");
    expect(attempt.items[0]?.fields.title?.value).toBe("SPA Item");
  });
});

describe("session packs", () => {
  it("parses Netscape cookie file", () => {
    const header = parseCookieFile(
      `# Netscape\n.example.com\tTRUE\t/\tFALSE\t0\tsession\tabc123\n`,
    );
    expect(header).toBe("session=abc123");
  });

  it("resolves cookies + headers", () => {
    const dir = resolve(".adaparse-test-session");
    mkdirSync(dir, { recursive: true });
    const cookies = resolve(dir, "cookies.txt");
    writeFileSync(cookies, "token=xyz\n", "utf8");
    const resolved = resolveSession({
      cookiesFile: cookies,
      headers: { authorization: "Bearer t", Cookie: "a=1" },
    });
    expect(resolved.headers.authorization).toBe("Bearer t");
    expect(resolved.headers.cookie).toContain("a=1");
    expect(resolved.headers.cookie).toContain("token=xyz");
  });
});
